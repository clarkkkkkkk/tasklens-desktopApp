fn main() {
    println!(
        "cargo:rustc-env=TASKLENS_TARGET_TRIPLE={}",
        std::env::var("TARGET").unwrap()
    );
    tauri_build::build()
}
