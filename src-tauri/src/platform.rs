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
        roots.push(dir.join("resources"));
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
    let file = fs::File::create(output).map_err(|_| GENERIC_ERROR.to_string())?;
    let mut child = spawn(
        command(program)
            .args(args)
            .stdout(file)
            .stderr(Stdio::null()),
    )
    .map_err(|_| "Could not start the local runtime.".to_string())?;
    wait(&mut child, output, cancel, limits)
}

fn wait(
    child: &mut Child,
    output: &Path,
    cancel: &AtomicBool,
    limits: Limits,
) -> Result<(), String> {
    let start = Instant::now();
    loop {
        let oversized = fs::metadata(output)
            .map(|m| m.len() > limits.max_output_bytes)
            .unwrap_or(false);
        if cancel.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(CANCELLED.into());
        }
        if start.elapsed() > limits.timeout || oversized {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Local processing exceeded its time or size limit.".into());
        }
        if let Some(status) = child.try_wait().map_err(|_| GENERIC_ERROR.to_string())? {
            return if status.success() {
                Ok(())
            } else {
                Err("The local runtime stopped unexpectedly.".into())
            };
        }
        std::thread::sleep(Duration::from_millis(40));
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
