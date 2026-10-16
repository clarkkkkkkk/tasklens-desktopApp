//! Local AI commands: model management, runtime lifecycle and structured completion.
//!
//! The webview never talks to llama.cpp directly; its CSP still allows only Tauri IPC.
//! Rust forwards bounded requests to the loopback-only server and returns raw text, which
//! the TypeScript extraction pipeline validates before anything reaches the review UI.
mod http;
pub mod model;
pub mod server;

use crate::{jobs::Jobs, ocr, platform};
use serde_json::{json, Value};
use server::{Config, Runtime, State};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
use tauri::Manager;

const MAX_PROMPT_BYTES: usize = 160_000;
const MAX_SCHEMA_BYTES: usize = 60_000;
const MAX_OUTPUT_TOKENS: u32 = 3072;

fn check_window(window: &tauri::Window) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Local AI is available only in the main window.".into())
    }
}

async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|_| platform::GENERIC_ERROR.to_string())?
}

fn status(app: &tauri::AppHandle) -> Value {
    let runtime = server::runtime(app);
    let mut runtime_status = runtime.status_json();
    let binary = platform::bundled_binary(app, "llama-server");
    runtime_status["binaryFound"] = json!(binary.is_some());
    runtime_status["binaryName"] = json!(binary
        .as_ref()
        .and_then(|p| p.file_name())
        .map(|s| s.to_string_lossy().into_owned()));
    runtime_status["cpuVariant"] = json!(if binary
        .as_ref()
        .is_some_and(|p| p.to_string_lossy().contains("-avx2"))
    {
        "avx2"
    } else {
        "baseline"
    });
    json!({
        "model": model::status(app),
        "runtime": runtime_status,
        "ocr": ocr::status(app),
        "localOnly": true,
    })
}

#[tauri::command]
pub async fn local_ai_status(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    check_window(&window)?;
    blocking(move || Ok(status(&app))).await
}

#[tauri::command]
pub async fn local_ai_diagnostics(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    check_window(&window)?;
    Ok(json!({"runtimeLog": server::runtime(&app).log_tail()}))
}

#[tauri::command]
pub async fn local_ai_import_model(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    check_window(&window)?;
    let spec = model::spec();
    let file = rfd::AsyncFileDialog::new()
        .set_title(format!(
            "Import {}",
            spec["file"].as_str().unwrap_or("the local model")
        ))
        .add_filter("GGUF model", &["gguf"])
        .pick_file()
        .await
        .ok_or("Model import cancelled.")?;
    let source = file.path().to_path_buf();
    blocking(move || {
        let runtime = server::runtime(&app);
        let _gate = runtime.gate.lock().unwrap();
        runtime.stop(&app);
        runtime.set(&app, State::Loading, "Installing model…");
        let result = model::import(&app, &source, &AtomicBool::new(false));
        match &result {
            Ok(()) => runtime.set(&app, State::Stopped, ""),
            Err(e) => runtime.set(&app, State::Failed, e),
        }
        result.map(|_| status(&app))
    })
    .await
}

#[tauri::command]
pub async fn local_ai_validate_model(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    check_window(&window)?;
    blocking(move || {
        let runtime = server::runtime(&app);
        let _gate = runtime.gate.lock().unwrap();
        runtime.stop(&app);
        runtime.set(&app, State::Loading, "Checking model integrity…");
        let result = model::verify(&app, &AtomicBool::new(false));
        match &result {
            Ok(()) => runtime.set(&app, State::Stopped, ""),
            Err(e) => runtime.set(&app, State::Failed, e),
        }
        result.map(|_| status(&app))
    })
    .await
}

#[tauri::command]
pub async fn local_ai_load(
    window: tauri::Window,
    app: tauri::AppHandle,
    config: Option<Config>,
    restart: Option<bool>,
) -> Result<Value, String> {
    check_window(&window)?;
    let config = config.unwrap_or_default().sanitized();
    blocking(move || {
        let runtime = server::runtime(&app);
        let _gate = runtime.gate.lock().unwrap();
        if restart == Some(true) {
            runtime.stop(&app);
        }
        runtime.ensure(&app, config)?;
        Ok(status(&app))
    })
    .await
}

#[tauri::command]
pub async fn local_ai_unload(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    check_window(&window)?;
    blocking(move || {
        let runtime = server::runtime(&app);
        let _gate = runtime.gate.lock().unwrap();
        runtime.stop(&app);
        Ok(status(&app))
    })
    .await
}

#[tauri::command]
pub async fn local_jobs_cancel(
    window: tauri::Window,
    app: tauri::AppHandle,
    id: String,
) -> Result<(), String> {
    check_window(&window)?;
    app.state::<Jobs>().cancel(&id)
}

/// Runs one schema-constrained completion. Output is raw text: validation happens in the
/// extraction pipeline, never here.
#[tauri::command]
pub async fn local_ai_complete(
    window: tauri::Window,
    app: tauri::AppHandle,
    id: String,
    prompt: String,
    schema: Value,
    max_tokens: u32,
    config: Option<Config>,
) -> Result<Value, String> {
    check_window(&window)?;
    if prompt.len() > MAX_PROMPT_BYTES || schema.to_string().len() > MAX_SCHEMA_BYTES {
        return Err("This source is too long for local extraction.".into());
    }
    let config = config.unwrap_or_default().sanitized();
    blocking(move || {
        let jobs = app.state::<Jobs>();
        let job = jobs.register(&id)?;
        let runtime = server::runtime(&app);
        let _gate = runtime.gate.lock().unwrap();
        if job.cancel.load(Ordering::SeqCst) {
            return Err(platform::CANCELLED.into());
        }
        let (port, key) = runtime.ensure(&app, config)?;
        runtime.set(&app, State::Processing, "");
        let result = complete(port, &key, &prompt, &schema, max_tokens, &job.cancel);
        let alive = runtime.status_json()["state"] == "processing";
        if alive {
            runtime.set(&app, State::Ready, "");
        }
        result
    })
    .await
}

fn complete(
    port: u16,
    key: &str,
    prompt: &str,
    schema: &Value,
    max_tokens: u32,
    cancel: &AtomicBool,
) -> Result<Value, String> {
    let body = json!({
        "prompt": prompt,
        "json_schema": schema,
        "n_predict": max_tokens.clamp(64, MAX_OUTPUT_TOKENS),
        "temperature": 0.0,
        "top_k": 1,
        "top_p": 1.0,
        "seed": 7,
        "cache_prompt": true,
        "stream": true,
        "stop": model::spec()["stopTokens"],
    })
    .to_string();
    let started = Instant::now();
    let mut parser = http::SseParser::default();
    let mut content = String::new();
    let mut error_body = Vec::new();
    let (mut truncated, mut timings) = (false, Value::Null);
    let status = http::send(
        http::Request {
            port,
            method: "POST",
            path: "/completion",
            api_key: key,
            body: Some(body.as_bytes()),
            timeout: Duration::from_secs(900),
            cancel: Some(cancel),
        },
        |bytes| {
            if error_body.len() < 4096 {
                error_body.extend_from_slice(&bytes[..bytes.len().min(4096)]);
            }
            parser.push(bytes, |data| {
                if let Ok(event) = serde_json::from_str::<Value>(data) {
                    if let Some(text) = event["content"].as_str() {
                        content.push_str(text);
                    }
                    if event["stop"].as_bool() == Some(true) {
                        truncated = event["stopped_limit"].as_bool() == Some(true);
                        timings = event["timings"].clone();
                    }
                }
                Ok(())
            })
        },
    )
    .map_err(|e| {
        if e.to_string() == http::CANCELLED_IO {
            platform::CANCELLED.to_string()
        } else {
            "MODEL_FAILED: The local model did not respond. Try again or reload the model in Settings.".to_string()
        }
    })?;
    if status != 200 {
        let detail = String::from_utf8_lossy(&error_body);
        let too_long = detail.contains("context") || detail.contains("exceed");
        return Err(if too_long {
            "This screenshot contains more text than the local model can read at once. Crop it and try again.".into()
        } else {
            "MODEL_FAILED: The local model rejected the request.".into()
        });
    }
    Ok(json!({
        "content": content,
        "truncated": truncated,
        "elapsedMs": started.elapsed().as_millis() as u64,
        "timings": timings,
    }))
}

pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    std::fs::create_dir_all(platform::app_data(app)?.join("models"))
        .map_err(|_| platform::GENERIC_ERROR.to_string())?;
    Ok(())
}

pub fn shutdown(app: &tauri::AppHandle) {
    if let Some(runtime) = app.try_state::<Runtime>() {
        runtime.shutdown();
    }
}
