//! Offline asset discovery and validation. Only build scripts access the network.
use crate::platform;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Instant, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};

pub fn manifest() -> Value {
    serde_json::from_str(include_str!("../resources/models.json")).expect("valid asset manifest")
}
pub fn spec(kind: &str) -> Value {
    manifest()[kind].clone()
}
pub fn import_path(app: &tauri::AppHandle, kind: &str) -> Result<PathBuf, String> {
    Ok(platform::app_data(app)?
        .join("models")
        .join(spec(kind)["file"].as_str().ok_or("Unknown model")?))
}
fn override_marker(app: &tauri::AppHandle, kind: &str) -> Result<PathBuf, String> {
    Ok(platform::app_data(app)?
        .join("asset-validation")
        .join(format!("{kind}-override.json")))
}
pub fn model_path(app: &tauri::AppHandle, kind: &str) -> Result<PathBuf, String> {
    let s = spec(kind);
    // Import is an explicit developer choice, not an implicit fallback for broken bundles.
    if fs::read_to_string(override_marker(app, kind)?)
        .ok()
        .as_deref()
        == s["sha256"].as_str()
    {
        return import_path(app, kind);
    }
    platform::resource(
        app,
        &format!("models/{}", s["file"].as_str().ok_or("Unknown model")?),
    )
}
fn receipt(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(platform::app_data(app)?
        .join("asset-validation")
        .join(format!("{id}.json")))
}
// AppImage uses a new temporary mount on each launch. Identify a resource by the
// unchanged container and its relative path instead of that disposable mount.
#[cfg(any(target_os = "linux", test))]
fn container_identity(path: &Path, executable: &Path, image: &Path, root: &Path) -> Option<Value> {
    let root = root.canonicalize().ok()?;
    executable.canonicalize().ok()?.strip_prefix(&root).ok()?;
    let path = path.canonicalize().ok()?;
    let relative = path.strip_prefix(&root).ok()?;
    let image = image.canonicalize().ok()?;
    let metadata = fs::metadata(&image).ok()?;
    if !metadata.is_file() {
        return None;
    }
    Some(
        json!({"container": image, "resource": relative, "bytes": metadata.len(),
        "modified": metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_nanos().to_string()}),
    )
}
fn fingerprint(app: &tauri::AppHandle, path: &Path, s: &Value) -> Result<Value, String> {
    let meta = fs::metadata(path).map_err(|_| "MODEL_NOT_INSTALLED: A bundled local intelligence resource is missing. Reinstall TaskLens to repair it.")?;
    // Only the Linux AppImage branch below rewrites the identity.
    #[cfg_attr(not(target_os = "linux"), allow(unused_mut))]
    let mut identity = json!(path.canonicalize().unwrap_or_else(|_| path.to_owned()));
    #[cfg(target_os = "linux")]
    {
        let env = app.env();
        if let (Some(image), Some(root), Ok(executable)) =
            (env.appimage, env.appdir, std::env::current_exe())
        {
            if let Some(container) =
                container_identity(path, &executable, Path::new(&image), Path::new(&root))
            {
                identity = container;
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = app;
    Ok(
        json!({"manifestVersion": manifest()["manifestVersion"], "path": identity, "bytes": meta.len(), "modified": meta.modified().ok().and_then(|v| v.duration_since(UNIX_EPOCH).ok()).map(|v| v.as_nanos().to_string()), "sha256": s["sha256"]}),
    )
}
pub fn cached(app: &tauri::AppHandle, id: &str, path: &Path, s: &Value) -> bool {
    let Ok(fp) = fingerprint(app, path, s) else {
        return false;
    };
    if fp["bytes"] != s["bytes"] {
        return false;
    }
    fs::read_to_string(receipt(app, id).unwrap_or_default())
        .ok()
        .and_then(|v| serde_json::from_str::<Value>(&v).ok())
        .is_some_and(|v| v == fp)
}
fn validate_file(path: &Path, s: &Value, cancel: &AtomicBool) -> Result<(), String> {
    let corrupt = "MODEL_CORRUPTED: A bundled local intelligence resource is damaged or incompatible. Reinstall TaskLens to repair it.";
    let mut file = fs::File::open(path).map_err(|_| "MODEL_NOT_INSTALLED: A bundled local intelligence resource is missing. Reinstall TaskLens to repair it.")?;
    if Some(file.metadata().map_err(|_| corrupt)?.len()) != s["bytes"].as_u64() {
        return Err(corrupt.into());
    }
    let mut digest = Sha256::new();
    let mut buffer = vec![0; 4 * 1024 * 1024];
    let mut first = true;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(platform::CANCELLED.into());
        }
        let n = file.read(&mut buffer).map_err(|_| corrupt)?;
        if n == 0 {
            break;
        }
        if first {
            let valid = match s["format"].as_str() {
                Some("gguf") => {
                    n >= 8 && &buffer[..4] == b"GGUF" && buffer[4..8] == 3u32.to_le_bytes()
                }
                Some("ggml") => n >= 4 && buffer[..4] == 0x67676d6cu32.to_le_bytes(),
                Some("traineddata") => {
                    n >= 4
                        && (1..=100).contains(&i32::from_le_bytes(buffer[..4].try_into().unwrap()))
                }
                _ => true,
            };
            if !valid {
                return Err(corrupt.into());
            }
            first = false;
        }
        digest.update(&buffer[..n]);
    }
    if format!("{:x}", digest.finalize()) != s["sha256"].as_str().unwrap_or_default() {
        return Err(corrupt.into());
    }
    Ok(())
}
pub fn verify(
    app: &tauri::AppHandle,
    id: &str,
    path: &Path,
    s: &Value,
    force: bool,
    cancel: &AtomicBool,
) -> Result<(), String> {
    static VALIDATION_GATE: Mutex<()> = Mutex::new(());
    let _gate = VALIDATION_GATE.lock().unwrap();
    if !force && cached(app, id, path, s) {
        return Ok(());
    }
    let before = fingerprint(app, path, s)?;
    validate_file(path, s, cancel)?;
    if before != fingerprint(app, path, s)? {
        return Err("MODEL_CORRUPTED: Resource changed during validation. Please retry.".into());
    }
    let p = receipt(app, id)?;
    fs::create_dir_all(p.parent().unwrap()).map_err(|_| platform::GENERIC_ERROR)?;
    let partial = p.with_extension("partial");
    fs::write(&partial, before.to_string()).map_err(|_| platform::GENERIC_ERROR)?;
    // Receipts are disposable caches; replacing one never touches model weights or user data.
    let _ = fs::remove_file(&p);
    fs::rename(partial, p).map_err(|_| platform::GENERIC_ERROR.to_string())
}
pub fn verify_model(
    app: &tauri::AppHandle,
    kind: &str,
    force: bool,
    cancel: &AtomicBool,
) -> Result<(), String> {
    verify(
        app,
        kind,
        &model_path(app, kind)?,
        &spec(kind),
        force,
        cancel,
    )
}
pub fn import(
    app: &tauri::AppHandle,
    kind: &str,
    source: &Path,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let s = spec(kind);
    validate_file(source, &s, cancel)?;
    let target = import_path(app, kind)?;
    fs::create_dir_all(target.parent().unwrap()).map_err(|_| platform::GENERIC_ERROR)?;
    let partial = target.with_extension("partial");
    let operation = (|| {
        let mut input = fs::File::open(source).map_err(|_| platform::GENERIC_ERROR)?;
        let mut output = fs::File::create(&partial).map_err(|_| platform::GENERIC_ERROR)?;
        let mut buffer = vec![0; 4 * 1024 * 1024];
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err(platform::CANCELLED.to_string());
            }
            let n = input
                .read(&mut buffer)
                .map_err(|_| platform::GENERIC_ERROR)?;
            if n == 0 {
                break;
            }
            output
                .write_all(&buffer[..n])
                .map_err(|_| platform::GENERIC_ERROR)?;
        }
        output.sync_all().map_err(|_| platform::GENERIC_ERROR)?;
        drop(output);
        validate_file(&partial, &s, cancel)?;
        // Keep the prior import until its replacement has been completely validated.
        let backup = target.with_extension("previous");
        if target.exists() {
            fs::rename(&target, &backup).map_err(|_| platform::GENERIC_ERROR)?;
        }
        if fs::rename(&partial, &target).is_err() {
            let _ = fs::rename(&backup, &target);
            return Err(platform::GENERIC_ERROR.into());
        }
        let _ = fs::remove_file(backup);
        let marker = override_marker(app, kind)?;
        fs::create_dir_all(marker.parent().unwrap()).map_err(|_| platform::GENERIC_ERROR)?;
        fs::write(marker, s["sha256"].as_str().unwrap()).map_err(|_| platform::GENERIC_ERROR)?;
        verify_model(app, kind, true, cancel)
    })();
    let _ = fs::remove_file(partial);
    operation
}

pub struct Initialization {
    status: Mutex<Value>,
    gate: Mutex<()>,
}
impl Default for Initialization {
    fn default() -> Self {
        Self {
            status: Mutex::new(
                json!({"state":"preparing", "message":"Preparing local intelligence…", "components":{}}),
            ),
            gate: Mutex::new(()),
        }
    }
}
fn publish(app: &tauri::AppHandle, state: &str, components: &Value, elapsed: u128) {
    let revision = app.state::<Initialization>().status.lock().unwrap()["revision"]
        .as_u64()
        .unwrap_or(0)
        + 1;
    let value = json!({"revision": revision, "state": state, "message": match state { "ready" => "Local AI is ready.", "error" => "Local intelligence needs repair. Retry validation or reinstall TaskLens. Your tasks are safe.", _ => "Preparing local intelligence…" }, "components": components, "elapsedMs": elapsed});
    *app.state::<Initialization>().status.lock().unwrap() = value.clone();
    let _ = app.emit("local-intelligence-status", value);
}
pub fn initialize(app: &tauri::AppHandle, force: bool) {
    let state = app.state::<Initialization>();
    let Ok(_gate) = state.gate.try_lock() else {
        return;
    };
    let started = Instant::now();
    let mut components = json!({});
    publish(app, "preparing", &components, 0);
    let cancel = AtomicBool::new(false);
    for kind in ["extraction", "whisper"] {
        let result = verify_model(app, kind, force, &cancel);
        components[kind] =
            json!({"state":if result.is_ok() { "ready" } else { "error" }, "message":result.err()});
        publish(app, "preparing", &components, started.elapsed().as_millis());
    }
    for name in ["llama-server", "whisper-cli", "tesseract"] {
        let result = (|| {
            let binary = platform::bundled_binary(app, name)
                .ok_or("RUNTIME_MISSING: A bundled runtime is missing. Reinstall TaskLens.")?;
            let output = platform::app_data(app)?.join(format!("{name}-probe.txt"));
            let result = platform::run_to_file(
                &binary,
                &["--help".into()],
                &output,
                &cancel,
                platform::Limits {
                    timeout: std::time::Duration::from_secs(20),
                    max_output_bytes: 1024 * 1024,
                },
            );
            let _ = fs::remove_file(output);
            // Component status is user-facing; the process trace retains typed details.
            result.map_err(|error| {
                serde_json::from_str::<crate::diagnostics::Failure>(&error)
                    .map(|failure| failure.message)
                    .unwrap_or(error)
            })
        })();
        components[name] =
            json!({"state":if result.is_ok() { "ready" } else { "error" }, "message":result.err()});
    }
    for s in manifest()["tesseract"]["data"].as_array().unwrap() {
        let name = s["file"].as_str().unwrap();
        let result = platform::resource(app, &format!("tessdata/{name}"))
            .and_then(|p| verify(app, name, &p, s, force, &cancel));
        components[name] =
            json!({"state":if result.is_ok() { "ready" } else { "error" }, "message":result.err()});
    }
    let ok = components
        .as_object()
        .unwrap()
        .values()
        .all(|v| v["state"] == "ready");
    publish(
        app,
        if ok { "ready" } else { "error" },
        &components,
        started.elapsed().as_millis(),
    );
}
#[tauri::command]
pub fn local_intelligence_status(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err(platform::GENERIC_ERROR.into());
    }
    let status = app.state::<Initialization>().status.lock().unwrap().clone();
    Ok(status)
}
#[tauri::command]
pub async fn local_intelligence_retry(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err(platform::GENERIC_ERROR.into());
    }
    tauri::async_runtime::spawn_blocking(move || initialize(&app, true))
        .await
        .map_err(|_| platform::GENERIC_ERROR.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn appimage_identity_survives_remount_but_rejects_unrelated_paths_and_upgrades() {
        let dir = std::env::temp_dir().join(format!("tasklens-mount-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let image = dir.join("TaskLens.AppImage");
        fs::write(&image, b"container").unwrap();
        let identity = |mount: &str| {
            let root = dir.join(mount);
            fs::create_dir_all(root.join("resources")).unwrap();
            fs::write(root.join("tasklens"), b"app").unwrap();
            fs::write(root.join("resources/model"), b"model").unwrap();
            container_identity(
                &root.join("resources/model"),
                &root.join("tasklens"),
                &image,
                &root,
            )
        };
        let first = identity("mount-one").unwrap();
        assert_eq!(Some(first.clone()), identity("mount-two"));
        let root = dir.join("mount-one");
        assert!(container_identity(&image, &root.join("tasklens"), &image, &root).is_none());
        assert!(container_identity(&root.join("resources/model"), &image, &image, &root).is_none());
        fs::write(&image, b"updated container").unwrap();
        assert_ne!(Some(first), identity("mount-three"));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn missing_corrupt_and_wrong_formats_fail_closed() {
        let p = std::env::temp_dir().join(format!("tasklens-asset-{}", uuid::Uuid::new_v4()));
        let bytes = b"GGUF\x03\0\0\0test";
        let s = json!({"bytes":bytes.len(), "sha256":format!("{:x}", Sha256::digest(bytes)),"format":"gguf"});
        let cancel = AtomicBool::new(false);
        assert!(validate_file(&p, &s, &cancel)
            .unwrap_err()
            .contains("MODEL_NOT_INSTALLED"));
        fs::write(&p, bytes).unwrap();
        assert!(validate_file(&p, &s, &cancel).is_ok());
        fs::write(&p, b"GGUF\x03\0\0\0evil").unwrap();
        assert!(validate_file(&p, &s, &cancel).is_err());
        let bad = b"<html>error!!";
        fs::write(&p, bad).unwrap();
        let s =
            json!({"bytes":bad.len(),"sha256":format!("{:x}",Sha256::digest(bad)),"format":"gguf"});
        assert!(validate_file(&p, &s, &cancel).is_err());
        let _ = fs::remove_file(p);
    }
}
