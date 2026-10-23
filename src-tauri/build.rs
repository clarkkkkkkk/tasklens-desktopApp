fn main() {
    println!(
        "cargo:rustc-env=TASKLENS_TARGET_TRIPLE={}",
        std::env::var("TARGET").unwrap()
    );
    let git = |args: &[&str]| {
        std::process::Command::new("git")
            .args(args)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };
    println!(
        "cargo:rustc-env=TASKLENS_BUILD_COMMIT={}",
        git(&["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".into())
    );
    println!(
        "cargo:rustc-env=TASKLENS_BUILD_DIRTY={}",
        git(&["status", "--porcelain", "--untracked-files=no"])
            .map(|s| !s.is_empty())
            .unwrap_or(true)
    );
    // Resolve Git paths for normal checkouts and linked worktrees. Watching HEAD alone
    // misses new commits on the same branch and can embed a stale release identity.
    for name in [
        Some("HEAD".to_string()),
        git(&["symbolic-ref", "-q", "HEAD"]),
    ]
    .into_iter()
    .flatten()
    {
        if let Some(path) = git(&["rev-parse", "--git-path", &name]) {
            if std::path::Path::new(&path).exists() {
                println!("cargo:rerun-if-changed={path}");
            }
        }
    }
    if let Some(path) = git(&["rev-parse", "--git-path", "packed-refs"]) {
        if std::path::Path::new(&path).exists() {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    println!("cargo:rerun-if-changed=src");
    tauri_build::build()
}
