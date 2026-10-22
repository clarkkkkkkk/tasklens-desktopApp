//! AI routing support: hardware facts, local Ollama, and optional BYOK Groq.
//!
//! The router itself runs in TypeScript. These commands only report detected facts and relay
//! requests to model servers on this computer. The separate Groq module owns all optional
//! authenticated cloud requests; its endpoints, credentials and consent gates stay native.
mod device;
pub mod groq;
mod ollama;

use crate::{jobs::Jobs, local_ai::server, platform};
use serde_json::Value;
use std::sync::atomic::Ordering;
use tauri::Manager;

const MAX_OLLAMA_REQUEST_BYTES: usize = 24 * 1024 * 1024;

fn check_window(window: &tauri::Window) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("AI routing is available only in the main window.".into())
    }
}

async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|_| platform::GENERIC_ERROR.to_string())?
}

#[tauri::command]
pub async fn ai_device_profile(window: tauri::Window) -> Result<Value, String> {
    check_window(&window)?;
    blocking(|| Ok(device::profile())).await
}

#[tauri::command]
pub async fn ai_ollama_discover(window: tauri::Window) -> Result<Value, String> {
    check_window(&window)?;
    blocking(|| Ok(ollama::discover())).await
}

/// One structured chat on the local Ollama server. Holds the shared local-inference gate and
/// stops the bundled llama-server first, so only one local model occupies memory at a time.
#[tauri::command]
pub async fn ai_ollama_chat(
    window: tauri::Window,
    app: tauri::AppHandle,
    id: String,
    body: Value,
) -> Result<Value, String> {
    check_window(&window)?;
    if body.to_string().len() > MAX_OLLAMA_REQUEST_BYTES {
        return Err("This source is too large for the local model.".into());
    }
    blocking(move || {
        let jobs = app.state::<Jobs>();
        let job = jobs.register(&id)?;
        let runtime = server::runtime(&app);
        let _gate = runtime.gate.lock().unwrap();
        if job.cancel.load(Ordering::SeqCst) {
            return Err(platform::CANCELLED.into());
        }
        runtime.stop(&app);
        ollama::chat(body, &job.cancel)
    })
    .await
}
