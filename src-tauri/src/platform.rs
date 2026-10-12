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

/// A runtime shipped with TaskLens (`resources/bin/<name>`), e.g. llama-server or whisper-cli.
pub fn bundled_binary(app: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    let file = exe_name(name);
    resource_roots(app)
        .into_iter()
        .map(|root| root.join("bin").join(&file))
        .find(|path| path.is_file())
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
        system_tesseract_candidates()
            .into_iter()
            .find(|p| p.is_file())
    })
}

/// Directories that may hold `*.traineddata`, most specific first. The app data copy wins
/// so user-imported languages (Cebuano, Tagalog) are used together with English.
pub fn tessdata_candidates(app: &tauri::AppHandle, tesseract: Option<&Path>) -> Vec<PathBuf> {
    let mut list = Vec::new();
    if let Ok(data) = app_data(app) {
        list.push(data.join("tessdata"));
    }
    for root in resource_roots(app) {
        list.push(root.join("tessdata"));
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
pub fn command(program: &Path) -> Command {
    let mut command = Command::new(program);
    command.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
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
    let mut child = command(program)
        .args(args)
        .stdout(file)
        .stderr(Stdio::null())
        .spawn()
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

pub const CANCELLED: &str = "Processing was cancelled.";

pub fn file_size(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|m| m.len())
}
