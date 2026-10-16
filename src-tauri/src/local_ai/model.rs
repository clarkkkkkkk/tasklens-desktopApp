//! Extraction model facade; asset discovery and receipts are shared with Whisper.
use crate::{assets, platform};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};
pub fn spec() -> Value {
    assets::spec("extraction")
}
pub fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    assets::model_path(app, "extraction")
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
pub fn state(app: &tauri::AppHandle) -> ModelState {
    let Ok(p) = path(app) else {
        return ModelState::NotInstalled;
    };
    let s = spec();
    match platform::file_size(&p) {
        None => ModelState::NotInstalled,
        Some(n) if Some(n) != s["bytes"].as_u64() => ModelState::Corrupted,
        _ if assets::cached(app, "extraction", &p, &s) => ModelState::Verified,
        _ => ModelState::Unverified,
    }
}
pub fn verify(app: &tauri::AppHandle, cancel: &AtomicBool) -> Result<(), String> {
    assets::verify_model(app, "extraction", true, cancel)
}
pub fn import(app: &tauri::AppHandle, source: &Path, cancel: &AtomicBool) -> Result<(), String> {
    assets::import(app, "extraction", source, cancel)
}
pub fn status(app: &tauri::AppHandle) -> Value {
    let s = spec();
    let p = path(app).ok();
    json!({"name":s["model"],"publisher":s["publisher"],"license":s["license"],"quantization":s["quantization"],"file":s["file"],"expectedBytes":s["bytes"],"sha256":s["sha256"],"source":s["source"],"path":p.as_ref().map(|v|v.to_string_lossy().to_string()),"bytes":p.as_deref().and_then(platform::file_size),"state":state(app).as_str()})
}
