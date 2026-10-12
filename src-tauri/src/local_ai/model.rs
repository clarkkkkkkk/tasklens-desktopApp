//! Model manager for the pinned Phi-4-mini-instruct GGUF.
//!
//! Weights are never committed or downloaded silently. The user imports the exact file named
//! in `resources/models.json`; its size and SHA-256 must match before llama.cpp loads it.
//! A successful verification is cached against the file's size and modification time so
//! the 2.5 GB hash is not recomputed on every launch.
use crate::platform;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::UNIX_EPOCH,
};

pub fn spec() -> Value {
    let data: Value = serde_json::from_str(include_str!("../../resources/models.json"))
        .expect("models.json is valid");
    data["extraction"].clone()
}

pub fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let file = spec()["file"].as_str().unwrap_or_default().to_string();
    Ok(platform::app_data(app)?.join("models").join(file))
}

fn cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(platform::app_data(app)?
        .join("models")
        .join("verified.json"))
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ModelState {
    NotInstalled,
    Unverified,
    Verified,
    Corrupted,
}

impl ModelState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotInstalled => "not_installed",
            Self::Unverified => "unverified",
            Self::Verified => "verified",
            Self::Corrupted => "corrupted",
        }
    }
}

fn fingerprint(path: &Path) -> Option<Value> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    Some(json!({"bytes": meta.len(), "modified": modified, "sha256": spec()["sha256"]}))
}

pub fn state(app: &tauri::AppHandle) -> ModelState {
    let Ok(model) = path(app) else {
        return ModelState::NotInstalled;
    };
    let Some(current) = fingerprint(&model) else {
        return ModelState::NotInstalled;
    };
    if Some(current["bytes"].as_u64()) != Some(spec()["bytes"].as_u64()) {
        return ModelState::Corrupted;
    }
    let cached = cache_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Value>(&s).ok());
    match cached {
        Some(c) if c["fingerprint"] == current => {
            if c["ok"].as_bool() == Some(true) {
                ModelState::Verified
            } else {
                ModelState::Corrupted
            }
        }
        _ => ModelState::Unverified,
    }
}

fn hash_reader(
    mut reader: impl Read,
    mut writer: Option<&mut fs::File>,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let mut digest = Sha256::new();
    let mut buffer = vec![0u8; 4 * 1024 * 1024];
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(platform::CANCELLED.into());
        }
        let n = reader
            .read(&mut buffer)
            .map_err(|_| "Could not read the model file.")?;
        if n == 0 {
            break;
        }
        digest.update(&buffer[..n]);
        if let Some(out) = writer.as_deref_mut() {
            out.write_all(&buffer[..n])
                .map_err(|_| "Could not copy the model. Check free disk space.")?;
        }
    }
    Ok(format!("{:x}", digest.finalize()))
}

/// Hashes the installed model and records the result.
pub fn verify(app: &tauri::AppHandle, cancel: &AtomicBool) -> Result<(), String> {
    let model = path(app)?;
    let file = fs::File::open(&model)
        .map_err(|_| "MODEL_NOT_INSTALLED: The local model is not installed.".to_string())?;
    let size_ok = file
        .metadata()
        .map(|m| Some(m.len()) == spec()["bytes"].as_u64())
        .unwrap_or(false);
    let ok = size_ok
        && hash_reader(file, None, cancel)? == spec()["sha256"].as_str().unwrap_or_default();
    if let Some(fp) = fingerprint(&model) {
        let _ = fs::write(
            cache_path(app)?,
            json!({"fingerprint": fp, "ok": ok}).to_string(),
        );
    }
    if ok {
        Ok(())
    } else {
        Err("MODEL_CORRUPTED: The model file does not match the supported Phi-4-mini-instruct build. Import it again.".into())
    }
}

/// Copies and hashes in one pass into a staging file, then atomically installs it.
pub fn import(app: &tauri::AppHandle, source: &Path, cancel: &AtomicBool) -> Result<(), String> {
    let expected = spec()["bytes"].as_u64().unwrap_or_default();
    if platform::file_size(source) != Some(expected) {
        return Err(format!(
            "This file is not the supported model. Choose {} ({} bytes).",
            spec()["file"].as_str().unwrap_or_default(),
            expected
        ));
    }
    let target = path(app)?;
    fs::create_dir_all(target.parent().unwrap())
        .map_err(|_| platform::GENERIC_ERROR.to_string())?;
    let staged = target.with_extension("partial");
    let result = (|| {
        let input = fs::File::open(source).map_err(|_| "Could not open the selected model.")?;
        let mut output = fs::File::create(&staged).map_err(|_| "Could not stage the model.")?;
        let sha = hash_reader(input, Some(&mut output), cancel)?;
        output
            .sync_all()
            .map_err(|_| "Could not finish copying the model.")?;
        drop(output);
        if sha != spec()["sha256"].as_str().unwrap_or_default() {
            return Err(
                "MODEL_CORRUPTED: The selected file's checksum does not match the supported model."
                    .into(),
            );
        }
        let _ = fs::remove_file(&target);
        fs::rename(&staged, &target).map_err(|_| "Could not install the model.".to_string())?;
        if let Some(fp) = fingerprint(&target) {
            let _ = fs::write(
                cache_path(app)?,
                json!({"fingerprint": fp, "ok": true}).to_string(),
            );
        }
        Ok(())
    })();
    let _ = fs::remove_file(&staged);
    result
}

pub fn status(app: &tauri::AppHandle) -> Value {
    let spec = spec();
    let model = path(app).ok();
    json!({
        "name": spec["model"],
        "publisher": spec["publisher"],
        "license": spec["license"],
        "quantization": spec["quantization"],
        "file": spec["file"],
        "expectedBytes": spec["bytes"],
        "sha256": spec["sha256"],
        "source": spec["source"],
        "path": model.as_ref().map(|p| p.to_string_lossy().to_string()),
        "bytes": model.as_deref().and_then(platform::file_size),
        "state": state(app).as_str(),
    })
}
