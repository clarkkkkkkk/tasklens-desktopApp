//! Platform resolution for local runtimes.
//!
//! Every OS-specific lookup (executable suffixes, bundled binaries, system Tesseract
//! locations, language data directories, hidden child processes) lives here so the
//! feature modules never branch on the operating system themselves.
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
use tauri::Manager;

pub const GENERIC_ERROR: &str = "Local processing could not complete. Please try again.";

pub fn app_data(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| GENERIC_ERROR.to_string())
}

pub fn exe_name(name: &str) -> String {
    format!("{}{}", name, std::env::consts::EXE_SUFFIX)
}

fn resource_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        // On Windows Tauri returns a canonical `\\?\C:\...` path, which disables `/`
        // normalisation; Tesseract appends `/eng.traineddata` and could not open its data.
        roots.push(dunce::simplified(&dir).join("resources"));
    }
    // Development builds read runtimes prepared by `npm run build:runtimes`.
    #[cfg(debug_assertions)]
    roots.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("resources"));
    roots
}

/// Resolve packaged read-only resources. Repository fallback exists only in debug builds.
pub fn resource(app: &tauri::AppHandle, relative: &str) -> Result<PathBuf, String> {
    resource_roots(app).into_iter().map(|p| p.join(relative)).find(|p| p.is_file())
        .ok_or_else(|| "MODEL_NOT_INSTALLED: A bundled local intelligence resource is missing. Reinstall TaskLens.".into())
}

/// Tauri externalBin sidecars are installed beside TaskLens with their target suffix removed.
pub fn bundled_binary(app: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    select_binary(name, avx2_runtime_supported(), |name| {
        bundled_binary_exact(app, name)
    })
}

fn select_binary(
    name: &str,
    accelerated: bool,
    lookup: impl Fn(&str) -> Option<PathBuf>,
) -> Option<PathBuf> {
    if accelerated && matches!(name, "llama-server" | "whisper-cli") {
        if let Some(binary) = lookup(&format!("{name}-avx2")) {
            return Some(binary);
        }
    }
    lookup(name)
}

fn avx2_runtime_supported() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        std::is_x86_feature_detected!("avx")
            && std::is_x86_feature_detected!("avx2")
            && std::is_x86_feature_detected!("fma")
            && std::is_x86_feature_detected!("f16c")
            && std::is_x86_feature_detected!("bmi2")
            && std::is_x86_feature_detected!("sse4.2")
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        false
    }
}

fn bundled_binary_exact(_app: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    let installed = std::env::current_exe()
        .ok()?
        .parent()?
        .join(exe_name(&format!("tasklens-{name}")));
    if installed.is_file() {
        return Some(installed);
    }
    #[cfg(debug_assertions)]
    {
        let triple = env!("TASKLENS_TARGET_TRIPLE");
        let p = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(exe_name(&format!("tasklens-{name}-{triple}")));
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn system_tesseract_candidates() -> Vec<PathBuf> {
    let mut list = Vec::new();
    if cfg!(windows) {
        for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Some(base) = std::env::var_os(var) {
                let base = PathBuf::from(base);
                list.push(base.join("Tesseract-OCR").join("tesseract.exe"));
                list.push(
                    base.join("Programs")
                        .join("Tesseract-OCR")
                        .join("tesseract.exe"),
                );
            }
        }
    } else {
        // GUI apps on macOS do not inherit the shell PATH, so list package-manager prefixes.
        for dir in [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/opt/local/bin",
        ] {
            list.push(Path::new(dir).join("tesseract"));
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            list.push(dir.join(exe_name("tesseract")));
        }
    }
    list
}

/// Tesseract OCR: a bundled copy first, then a system installation.
pub fn tesseract_binary(app: &tauri::AppHandle) -> Option<PathBuf> {
    bundled_binary(app, "tesseract").or_else(|| {
        if !cfg!(debug_assertions) {
            return None;
        }
        system_tesseract_candidates()
            .into_iter()
            .find(|p| p.is_file())
    })
}

/// Directories that may hold `*.traineddata`, most specific first. The app data copy wins
/// so user-imported languages (Cebuano, Tagalog) are used together with English.
pub fn tessdata_candidates(app: &tauri::AppHandle, tesseract: Option<&Path>) -> Vec<PathBuf> {
    let mut list = Vec::new();

    for root in resource_roots(app) {
        list.push(root.join("tessdata"));
    }
    if !cfg!(debug_assertions) {
        return list;
    }
    if let Some(binary) = tesseract {
        if let Some(dir) = binary.parent() {
            list.push(dir.join("tessdata"));
            list.push(dir.join("..").join("share").join("tessdata"));
        }
    }
    if !cfg!(windows) {
        for dir in [
            "/opt/homebrew/share/tessdata",
            "/usr/local/share/tessdata",
            "/usr/share/tesseract-ocr/5/tessdata",
            "/usr/share/tesseract-ocr/4.00/tessdata",
            "/usr/share/tessdata",
        ] {
            list.push(PathBuf::from(dir));
        }
    }
    list
}

/// A child process that never opens a console window and never inherits stdin.
/// Children started through `spawn` never outlive TaskLens, even after a crash.
pub fn command(program: &Path) -> Command {
    let mut command = Command::new(program);
    command.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::process::CommandExt;
        // SAFETY: prctl is async-signal-safe; the closure only sets the parent-death signal.
        unsafe {
            command.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL);
                Ok(())
            });
        }
    }
    command
}

/// Spawns a runtime and ties it to TaskLens's lifetime. On Windows the child joins a job
/// object that the OS closes, killing the child, when TaskLens exits for any reason; on
/// Linux `command` sets a parent-death signal. macOS relies on the normal exit cleanup.
pub fn spawn(command: &mut Command) -> std::io::Result<Child> {
    let child = command.spawn()?;
    #[cfg(windows)]
    windows_job::assign(&child);
    Ok(child)
}

#[cfg(windows)]
mod windows_job {
    use std::{os::windows::io::AsRawHandle, process::Child, sync::OnceLock};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// The job handle is intentionally never closed: Windows closes it when TaskLens exits.
    fn job() -> usize {
        static JOB: OnceLock<usize> = OnceLock::new();
        *JOB.get_or_init(|| unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return 0;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const std::ffi::c_void,
                std::mem::size_of_val(&info) as u32,
            );
            job as usize
        })
    }

    pub fn assign(child: &Child) {
        let job = job();
        if job != 0 {
            unsafe {
                AssignProcessToJobObject(job as _, child.as_raw_handle() as _);
            }
        }
    }
}

pub struct Limits {
    pub timeout: Duration,
    pub max_output_bytes: u64,
}

/// Runs a short-lived tool with structured arguments (never a shell), writing stdout to
/// `output`. Stops the process when cancelled, timed out, or when output grows too large.
pub fn run_to_file(
    program: &Path,
    args: &[String],
    output: &Path,
    cancel: &AtomicBool,
    limits: Limits,
) -> Result<(), String> {
    run_traced(
        program,
        args,
        output,
        cancel,
        limits,
        None,
        None,
        "asset_probe",
    )
}

pub fn run_traced(
    program: &Path,
    args: &[String],
    output: &Path,
    cancel: &AtomicBool,
    limits: Limits,
    trace: Option<&str>,
    job: Option<&str>,
    stage: &'static str,
) -> Result<(), String> {
    use crate::diagnostics::{Failure, Span};
    let name = program.file_name().unwrap_or_default().to_string_lossy();
    let runtime = if name.contains("tesseract") {
        "tesseract"
    } else if name.contains("whisper") {
        "whisper-cli"
    } else if name.contains("llama") {
        "llama-server"
    } else {
        "other"
    };
    let span = Span::new(stage, trace, job).runtime(runtime);
    if cancel.load(Ordering::SeqCst) {
        span.finish("CANCELLED", None, None, &[]);
        return Err(Failure::wire(
            "CANCELLED",
            "CANCELLED",
            stage,
            "Processing was cancelled.",
        ));
    }
    let file = fs::File::create(output).map_err(|_| GENERIC_ERROR.to_string())?;
    let mut child = match spawn(
        command(program)
            .args(args)
            .stdout(file)
            .stderr(Stdio::piped()),
    ) {
        Ok(child) => child,
        Err(error) => {
            span.finish("SPAWN_FAILED", None, None, &[]);
            return Err(Failure::wire(
                "RUNTIME_MISSING",
                if error.kind() == std::io::ErrorKind::PermissionDenied {
                    "PERMISSION_DENIED"
                } else {
                    "SPAWN_FAILED"
                },
                stage,
                "Could not start the local runtime.",
            ));
        }
    };
    let pid = child.id();
    let stderr = child.stderr.take().map(crate::diagnostics::stderr_reader);
    let start = Instant::now();
    let mut last_sample = Instant::now();
    let (outcome, status) = loop {
        if crate::diagnostics::enabled() && last_sample.elapsed() >= Duration::from_secs(5) {
            crate::diagnostics::process_sample(stage, trace, job, pid);
            last_sample = Instant::now();
        }
        let oversized = fs::metadata(output)
            .map(|m| m.len() > limits.max_output_bytes)
            .unwrap_or(false);
        if cancel.load(Ordering::SeqCst) || start.elapsed() > limits.timeout || oversized {
            let outcome = if cancel.load(Ordering::SeqCst) {
                "CANCELLED"
            } else if oversized {
                "OUTPUT_LIMIT"
            } else {
                "TIMEOUT"
            };
            let _ = child.kill();
            break (outcome, child.wait().ok());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                break (
                    if status.success() {
                        "OK"
                    } else {
                        "PROCESS_EXIT"
                    },
                    Some(status),
                )
            }
            Err(_) => {
                let _ = child.kill();
                break ("PROCESS_WAIT_FAILED", child.wait().ok());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
        }
    };
    let categories = stderr.and_then(|r| r.join().ok()).unwrap_or_default();
    span.finish(outcome, Some(pid), status, &categories);
    let detail = match status.and_then(|s| s.code()).map(|c| c as u32) {
        Some(0xC0000135) => "DLL_NOT_FOUND",
        Some(0xC000007B) => "INVALID_IMAGE_FORMAT",
        Some(0xC000001D) => "ILLEGAL_INSTRUCTION",
        Some(0xC0000005) => "ACCESS_VIOLATION",
        _ => outcome,
    };
    match outcome {
        "OK" => Ok(()),
        "CANCELLED" => Err(Failure::wire(
            "CANCELLED",
            outcome,
            stage,
            "Processing was cancelled.",
        )),
        "TIMEOUT" | "OUTPUT_LIMIT" => Err(Failure::wire(
            "OCR_FAILED",
            outcome,
            stage,
            "Local processing exceeded its time or size limit.",
        )),
        _ => Err(Failure::wire(
            if stage == "asset_probe" {
                "RUNTIME_MISSING"
            } else {
                "OCR_FAILED"
            },
            detail,
            stage,
            "The local runtime stopped unexpectedly.",
        )),
    }
}

/// Runs a short read-only system tool (structured arguments, never a shell) and returns its
/// stdout, at most 64 KiB. `None` when it is missing, fails or exceeds `timeout`.
pub fn capture(program: &Path, args: &[&str], timeout: Duration) -> Option<String> {
    use std::io::Read;
    let mut child = spawn(
        command(program)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::null()),
    )
    .ok()?;
    let stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout.take(64 * 1024).read_to_end(&mut buffer);
        buffer
    });
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = reader.join().ok()?;
                return status
                    .success()
                    .then(|| String::from_utf8_lossy(&output).into_owned());
            }
            Ok(None) if start.elapsed() < timeout => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

pub const CANCELLED: &str = "Processing was cancelled.";

pub fn file_size(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|m| m.len())
}

#[cfg(test)]
mod runtime_selection_tests {
    use super::*;
    #[test]
    fn unsupported_cpu_never_selects_accelerated_instructions() {
        let lookup = |name: &str| Some(PathBuf::from(name));
        assert_eq!(
            select_binary("llama-server", false, lookup),
            Some(PathBuf::from("llama-server"))
        );
        assert_eq!(
            select_binary("whisper-cli", false, lookup),
            Some(PathBuf::from("whisper-cli"))
        );
        assert_eq!(
            select_binary("llama-server", true, lookup),
            Some(PathBuf::from("llama-server-avx2"))
        );
        assert_eq!(
            select_binary("whisper-cli", true, lookup),
            Some(PathBuf::from("whisper-cli-avx2"))
        );
        assert_eq!(
            select_binary("tesseract", true, lookup),
            Some(PathBuf::from("tesseract"))
        );
    }
    #[test]
    fn missing_accelerated_runtime_preserves_baseline_fallback() {
        assert_eq!(
            select_binary("llama-server", true, |name| {
                (!name.ends_with("-avx2")).then(|| PathBuf::from(name))
            }),
            Some(PathBuf::from("llama-server"))
        );
        assert_eq!(select_binary("llama-server", true, |_| None), None);
    }
}

#[cfg(test)]
mod process_tests {
    use super::*;
    #[test]
    #[ignore = "Child process fixture for cancellation/timeout tests"]
    fn sleep_fixture() {
        std::thread::sleep(Duration::from_secs(10));
    }
    #[test]
    fn distinguishes_exit_timeout_and_cancel() {
        let folder =
            std::env::temp_dir().join(format!("tasklens-process-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&folder).unwrap();
        let executable = std::env::current_exe().unwrap();
        let limits = || Limits {
            timeout: Duration::from_millis(150),
            max_output_bytes: 65536,
        };
        let failed = run_to_file(
            &executable,
            &["--invalid-test-argument".into()],
            &folder.join("failed.txt"),
            &AtomicBool::new(false),
            Limits {
                timeout: Duration::from_secs(5),
                max_output_bytes: 65536,
            },
        )
        .unwrap_err();
        assert!(failed.contains("PROCESS_EXIT"));
        let timed = run_to_file(
            &executable,
            &[
                "--exact".into(),
                "platform::process_tests::sleep_fixture".into(),
                "--ignored".into(),
            ],
            &folder.join("timeout.txt"),
            &AtomicBool::new(false),
            limits(),
        )
        .unwrap_err();
        assert!(timed.contains("TIMEOUT"));
        let cancelled = run_to_file(
            Path::new("does-not-exist"),
            &[],
            &folder.join("cancel.txt"),
            &AtomicBool::new(true),
            limits(),
        )
        .unwrap_err();
        assert!(cancelled.contains("CANCELLED"));
        assert!(!folder.join("cancel.txt").exists());
        fs::remove_dir_all(folder).unwrap();
    }
}
