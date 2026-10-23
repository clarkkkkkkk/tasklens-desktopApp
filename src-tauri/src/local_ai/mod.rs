//! Local AI commands: model management, runtime lifecycle and structured completion.
//!
//! The webview never talks to llama.cpp directly; its CSP still allows only Tauri IPC.
//! Rust forwards bounded requests to the loopback-only server and returns raw text, which
//! the TypeScript extraction pipeline validates before anything reaches the review UI.
pub(crate) mod http;
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
    trace_id: Option<String>,
    schema_json: Option<String>,
) -> Result<Value, String> {
    check_window(&window)?;
    if prompt.len() > MAX_PROMPT_BYTES || schema.to_string().len() > MAX_SCHEMA_BYTES {
        return Err("This source is too long for local extraction.".into());
    }
    if let Some(trace) = &trace_id {
        crate::jobs::valid_id(trace)?;
    }
    if let Some(raw) = &schema_json {
        if raw.len() > MAX_SCHEMA_BYTES
            || serde_json::from_str::<Value>(raw).ok().as_ref() != Some(&schema)
        {
            return Err("Invalid extraction schema.".into());
        }
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
        let readiness = crate::diagnostics::Span::new("readiness", trace_id.as_deref(), Some(&id));
        let ensured = runtime.ensure_with_cancel(
            &app,
            config,
            Some(&job.cancel),
            trace_id.as_deref(),
            Some(&id),
        );
        readiness.finish(
            if ensured.is_ok() {
                "OK"
            } else {
                "MODEL_LOAD_FAILED"
            },
            runtime.pid(),
            runtime.exit_status(),
            &[],
        );
        let (port, key) = ensured?;
        runtime.set(&app, State::Processing, "");
        let span = crate::diagnostics::Span::new("inference", trace_id.as_deref(), Some(&id));
        let monitor = runtime.monitor(trace_id.clone(), id.clone());
        let result = complete(
            port,
            &key,
            &prompt,
            &schema,
            max_tokens,
            &job.cancel,
            schema_json.as_deref(),
        );
        drop(monitor);
        if let Ok(response) = &result {
            crate::diagnostics::model_timings(trace_id.as_deref(), &id, &response["timings"]);
        }
        let detail = result
            .as_ref()
            .err()
            .and_then(|e| serde_json::from_str::<crate::diagnostics::Failure>(e).ok())
            .map(|e| e.detail_code)
            .unwrap_or_else(|| "OK".into());
        span.finish(&detail, runtime.pid(), runtime.exit_status(), &[]);
        if job.cancel.load(Ordering::SeqCst) {
            runtime.stop(&app);
        } else {
            runtime.reconcile(&app, result.is_ok());
        }
        result
    })
    .await
}

/// Loads the model if needed and evaluates the fixed prompt prefix without generating, so
/// llama.cpp's prompt cache already holds it when the first extraction arrives. Started
/// while OCR runs; a later completion waits on the same gate and reuses the cached prefix.
#[tauri::command]
pub async fn local_ai_prewarm(
    window: tauri::Window,
    app: tauri::AppHandle,
    id: String,
    prefix: String,
    config: Option<Config>,
    trace_id: Option<String>,
) -> Result<Value, String> {
    check_window(&window)?;
    if prefix.len() > MAX_PROMPT_BYTES {
        return Err("The prompt prefix is too long.".into());
    }
    if let Some(trace) = &trace_id {
        crate::jobs::valid_id(trace)?;
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
        let readiness = crate::diagnostics::Span::new("readiness", trace_id.as_deref(), Some(&id));
        let ensured = runtime.ensure_with_cancel(
            &app,
            config,
            Some(&job.cancel),
            trace_id.as_deref(),
            Some(&id),
        );
        readiness.finish(
            if ensured.is_ok() {
                "OK"
            } else {
                "MODEL_LOAD_FAILED"
            },
            runtime.pid(),
            runtime.exit_status(),
            &[],
        );
        let (port, key) = ensured?;
        let preparation_span=crate::diagnostics::Span::new("prefix_prepare",trace_id.as_deref(),Some(&id));
        let result=(|| {
        let started = Instant::now();
        let post = |path: &str, body: Value| {
            let body = body.to_string();
            let mut response = Vec::new();
            let status = http::send(
                http::Request {
                    port,
                    method: "POST",
                    path,
                    api_key: Some(&key),
                    body: Some(body.as_bytes()),
                    timeout: Duration::from_secs(600),
                    cancel: Some(&job.cancel),
                },
                |bytes| {
                    if response.len() + bytes.len() > 8 * 1024 * 1024 {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            "response limit",
                        ));
                    }
                    response.extend_from_slice(bytes);
                    Ok(())
                },
            )
            .map_err(|e| {
                crate::diagnostics::Failure::wire(
                    if e.to_string() == http::CANCELLED_IO {
                        "CANCELLED"
                    } else {
                        "MODEL_FAILED"
                    },
                    crate::diagnostics::transport(&e),
                    "prefix_prepare",
                    if e.to_string() == http::CANCELLED_IO {
                        "Processing was cancelled."
                    } else {
                        "The local model did not respond."
                    },
                )
            })?;
            if status == 200
                && !serde_json::from_slice::<Value>(&response)
                    .is_ok_and(|value| value.is_object() && value.get("error").is_none())
            {
                return Err(crate::diagnostics::Failure::wire(
                    "MODEL_FAILED",
                    "INVALID_RESPONSE",
                    "prefix_prepare",
                    "The local model returned an invalid preparation response.",
                ));
            }
            Ok(status)
        };
        // The slot file is named after the model and the exact prefix, so a prompt or model
        // change never restores stale state.
        let cache_dir = server::prompt_cache_dir(&app);
        let file = {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(model::spec()["sha256"].as_str().unwrap_or_default());
            hasher.update(
                model::path(&app)
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            );
            hasher.update(include_str!("../../resources/models.json"));
            hasher.update(config.context_size.to_le_bytes());
            hasher.update(&prefix);
            let digest = hasher.finalize();
            format!(
                "prefix-{}.bin",
                digest[..12]
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect::<String>()
            )
        };
        if cache_dir.as_ref().is_some_and(|d| d.join(&file).is_file()) {
            match post("/slots/0?action=restore", json!({"filename":file})) {
                Ok(200) => {
                    return Ok(
                        json!({"elapsedMs":started.elapsed().as_millis() as u64,"restored":true}),
                    )
                }
                Ok(_) => {}
                Err(error) => {
                    if !job.cancel.load(Ordering::SeqCst) {
                        if let Some(dir) = &cache_dir {
                            let _ = std::fs::remove_file(dir.join(&file));
                        }
                        runtime.reconcile(&app, false);
                    }
                    return Err(error);
                }
            }
        }
        if let Some(dir) = &cache_dir {
            let _ = std::fs::remove_file(dir.join(&file));
        }
        let status = post(
            "/completion",
            json!({ "prompt": prefix, "n_predict": 0, "cache_prompt": true }),
        )?;
        if status != 200 {
            return Err("MODEL_FAILED: The local model rejected the request.".into());
        }
        if let Some(dir) = cache_dir {
            if post("/slots/0?action=save", json!({ "filename": file }))? == 200 {
                // Keep only the current prefix; older files belong to previous prompts.
                for entry in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if name.starts_with("prefix-") && name != file {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
        Ok(json!({ "elapsedMs": started.elapsed().as_millis() as u64, "restored": false }))
        })();
        let outcome=result.as_ref().err().and_then(|e|serde_json::from_str::<crate::diagnostics::Failure>(e).ok()).map(|e|e.detail_code).unwrap_or_else(||"OK".into());
        preparation_span.finish(&outcome,runtime.pid(),runtime.exit_status(),&[]);
        if job.cancel.load(Ordering::SeqCst){runtime.stop(&app);}
        result
    })
    .await
}

#[derive(Default)]
struct CompletionStream {
    parser: http::SseParser,
    content: String,
    terminal: bool,
    truncated: bool,
    timings: Value,
    bytes: usize,
}
impl CompletionStream {
    fn push(&mut self, bytes: &[u8]) -> std::io::Result<()> {
        self.bytes += bytes.len();
        if self.bytes > 8 * 1024 * 1024 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "response limit",
            ));
        }
        self.parser.push(bytes, |data| {
            if data == "[DONE]" {
                return Ok(());
            }
            let event: Value = serde_json::from_str(data).map_err(|_| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "malformed completion event",
                )
            })?;
            if event.get("error").is_some() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "runtime error event",
                ));
            }
            if let Some(text) = event["content"].as_str() {
                if self.terminal && !text.is_empty() {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "content after terminal",
                    ));
                }
                self.content.push_str(text);
            }
            if event["stop"].as_bool() == Some(true) {
                self.terminal = true;
                self.truncated = event["stopped_limit"].as_bool() == Some(true);
                self.timings = event["timings"].clone();
            }
            Ok(())
        })
    }
    fn finish(&self) -> Result<(), String> {
        if !self.terminal || !self.parser.complete() || self.content.trim().is_empty() {
            return Err(crate::diagnostics::Failure::wire(
                "MODEL_FAILED",
                "INCOMPLETE_RESPONSE",
                "inference",
                "The local model returned an incomplete response. Try again.",
            ));
        }
        Ok(())
    }
}

fn complete(
    port: u16,
    key: &str,
    prompt: &str,
    schema: &Value,
    max_tokens: u32,
    cancel: &AtomicBool,
    schema_json: Option<&str>,
) -> Result<Value, String> {
    // RawValue preserves frontend schema property order without changing global JSON map
    // ordering (which is also used by durable reminder fingerprints).
    #[derive(serde::Serialize)]
    struct CompletionBody<'a> {
        prompt: &'a str,
        json_schema: &'a serde_json::value::RawValue,
        n_predict: u32,
        temperature: f32,
        top_k: u8,
        top_p: f32,
        seed: u8,
        cache_prompt: bool,
        stream: bool,
        stop: Value,
    }
    let fallback = schema.to_string();
    let raw =
        serde_json::from_str::<Box<serde_json::value::RawValue>>(schema_json.unwrap_or(&fallback))
            .map_err(|_| "Invalid extraction schema.")?;
    let body = serde_json::to_string(&CompletionBody {
        prompt,
        json_schema: &raw,
        n_predict: max_tokens.clamp(64, MAX_OUTPUT_TOKENS),
        temperature: 0.0,
        top_k: 1,
        top_p: 1.0,
        seed: 7,
        cache_prompt: true,
        stream: true,
        stop: model::spec()["stopTokens"].clone(),
    })
    .map_err(|_| "Invalid extraction request.")?;
    let started = Instant::now();
    let mut stream = CompletionStream::default();
    let mut error_body = Vec::new();
    let response = http::send(
        http::Request {
            port,
            method: "POST",
            path: "/completion",
            api_key: Some(key),
            body: Some(body.as_bytes()),
            timeout: Duration::from_secs(900),
            cancel: Some(cancel),
        },
        |bytes| {
            if error_body.len() < 4096 {
                error_body.extend_from_slice(&bytes[..bytes.len().min(4096 - error_body.len())]);
            }
            stream.push(bytes)
        },
    );
    let status = response.map_err(|e| {
        crate::diagnostics::Failure::wire(
            if e.to_string() == http::CANCELLED_IO {
                "CANCELLED"
            } else {
                "MODEL_FAILED"
            },
            crate::diagnostics::transport(&e),
            "inference",
            if e.to_string() == http::CANCELLED_IO {
                "Processing was cancelled."
            } else {
                "The local model did not respond. Try again or reload the model in Settings."
            },
        )
    })?;
    if status != 200 {
        let detail = String::from_utf8_lossy(&error_body);
        return Err(crate::diagnostics::Failure::wire(
            "MODEL_FAILED",
            "HTTP_REJECTED",
            "inference",
            if detail.contains("context") || detail.contains("exceed") {
                "This source contains more text than the local model can read at once. Shorten it and try again."
            } else {
                "The local model rejected the request."
            },
        ));
    }
    stream.finish()?;
    let CompletionStream {
        content,
        truncated,
        timings,
        ..
    } = stream;
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_frontend_schema_order_without_changing_durable_json_order() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut bytes = Vec::new();
            let mut chunk = [0u8; 4096];
            loop {
                let n = socket.read(&mut chunk).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
                if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]);
                    let length = headers
                        .lines()
                        .find_map(|l| l.strip_prefix("Content-Length: "))
                        .unwrap()
                        .parse::<usize>()
                        .unwrap();
                    if bytes.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            let request = String::from_utf8(bytes).unwrap();
            let items = request.find("\"items\"").unwrap();
            let ambiguities = request.find("\"ambiguities\"").unwrap();
            assert!(items < ambiguities);
            socket.write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\ndata: {\"content\":\"{}\",\"stop\":true}\n\n").unwrap();
        });
        let raw = r#"{"type":"object","properties":{"items":{"type":"array"},"ambiguities":{"type":"array"}}}"#;
        let schema: Value = serde_json::from_str(raw).unwrap();
        complete(
            port,
            "synthetic",
            "synthetic",
            &schema,
            64,
            &AtomicBool::new(false),
            Some(raw),
        )
        .unwrap();
        worker.join().unwrap();
        assert_eq!(json!({"z":1,"a":2}).to_string(), r#"{"a":2,"z":1}"#);
    }
    #[test]
    fn rejects_incomplete_and_malformed_completion() {
        let mut stream = CompletionStream::default();
        stream.push(b"data: {\"content\":\"{}\"}\n\n").unwrap();
        assert!(stream.finish().unwrap_err().contains("INCOMPLETE_RESPONSE"));
        assert!(stream.push(b"data: not json\n\n").is_err());
        let mut stream = CompletionStream::default();
        stream
            .push(b"data: {\"content\":\"{}\",\"stop\":true}\n\n")
            .unwrap();
        assert!(stream.finish().is_ok());
        assert!(stream.push(b"data: {\"content\":\"extra\"}\n\n").is_err());
    }
    #[test]
    fn native_transport_detects_truncated_stream() {
        use std::io::{BufRead, BufReader, Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            // Consume the full request before closing. Unread client bytes can cause
            // a TCP reset instead of the clean EOF this particular fixture tests.
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            let mut length = 0;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line == "\r\n" {
                    break;
                }
                if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                    length = value.trim().parse::<usize>().unwrap();
                }
            }
            reader.read_exact(&mut vec![0; length]).unwrap();
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\ndata: {\"content\":\"{}\"}\n\n",
                )
                .unwrap();
        });
        let error = complete(
            port,
            "synthetic-key",
            "synthetic prompt",
            &json!({}),
            64,
            &AtomicBool::new(false),
            None,
        )
        .unwrap_err();
        worker.join().unwrap();
        assert!(error.contains("INCOMPLETE_RESPONSE"), "{error}");
    }
    #[test]
    #[ignore = "Real pinned model; run with the synthetic reliability probe"]
    fn native_completion_smoke() {
        let request: Value = serde_json::from_slice(
            &std::fs::read(std::env::var("TASKLENS_NATIVE_REQUEST").unwrap()).unwrap(),
        )
        .unwrap();
        let output = std::path::PathBuf::from(request["output"].as_str().unwrap());
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let key = uuid::Uuid::new_v4().to_string();
        crate::diagnostics::set_recording(true);
        let mut child = platform::spawn(
            platform::command(std::path::Path::new(request["binary"].as_str().unwrap()))
                .args([
                    "--model",
                    request["model"].as_str().unwrap(),
                    "--host",
                    "127.0.0.1",
                    "--port",
                    &port.to_string(),
                    "--api-key",
                    &key,
                    "--ctx-size",
                    "8192",
                    "--parallel",
                    "1",
                    "--n-gpu-layers",
                    "0",
                    "--no-webui",
                    "--slot-save-path",
                    request["cacheDirectory"].as_str().unwrap(),
                ])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::piped()),
        )
        .unwrap();
        let pid = child.id();
        let stderr = crate::diagnostics::stderr_reader(child.stderr.take().unwrap());
        let started = Instant::now();
        let health = || {
            http::send(
                http::Request {
                    port,
                    method: "GET",
                    path: "/health",
                    api_key: Some(&key),
                    body: None,
                    timeout: Duration::from_secs(2),
                    cancel: None,
                },
                |_| Ok(()),
            )
        };
        while started.elapsed() < server::MODEL_LOAD_BUDGET && !health().is_ok_and(|s| s == 200) {
            if child.try_wait().unwrap().is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        let load_ms = started.elapsed().as_millis();
        let operation = (|| -> Result<Value, String> {
            if health().ok() != Some(200) {
                return Err("MODEL_LOAD_FAILED".into());
            }
            let prefix_start = Instant::now();
            let prefix_body = if let Some(file) = request["prefixFile"].as_str() {
                json!({"filename":file})
            } else {
                json!({"prompt":request["prefix"],"n_predict":0,"cache_prompt":true})
            }
            .to_string();
            let route = if request["prefixFile"].is_string() {
                "/slots/0?action=restore"
            } else {
                "/completion"
            };
            let status = http::send(
                http::Request {
                    port,
                    method: "POST",
                    path: route,
                    api_key: Some(&key),
                    body: Some(prefix_body.as_bytes()),
                    timeout: Duration::from_secs(600),
                    cancel: None,
                },
                |_| Ok(()),
            )
            .map_err(|e| crate::diagnostics::transport(&e).to_string())?;
            if status != 200 {
                return Err("PREFIX_FAILED".into());
            }
            let prefix_ms = prefix_start.elapsed().as_millis();
            let done = std::sync::Arc::new(AtomicBool::new(false));
            let stop = done.clone();
            let monitor = std::thread::spawn(move || {
                while !stop.load(Ordering::SeqCst) {
                    crate::diagnostics::process_sample("inference", None, None, pid);
                    std::thread::sleep(Duration::from_millis(500));
                }
            });
            let started = Instant::now();
            let result = complete(
                port,
                &key,
                request["prompt"].as_str().unwrap(),
                &request["schema"],
                2048,
                &AtomicBool::new(false),
                request["schemaJson"].as_str(),
            );
            done.store(true, Ordering::SeqCst);
            monitor.join().unwrap();
            let elapsed = started.elapsed().as_millis();
            let health_after = health().ok();
            let exit = child.try_wait().unwrap();
            Ok(
                json!({"loadMs":load_ms,"prefixMs":prefix_ms,"requestMs":elapsed,"healthAfter":health_after,"exitCode":exit.and_then(|s|s.code()),"response":result.as_ref().ok(),"failure":result.err(),"diagnostics":crate::diagnostics::events()}),
            )
        })();
        let _ = child.kill();
        let _ = child.wait();
        let categories = stderr.join().unwrap();
        let report = match operation {
            Ok(v) => v,
            Err(e) => json!({"failure":e,"loadMs":load_ms}),
        };
        std::fs::write(
            &output,
            serde_json::to_vec_pretty(&json!({"report":report,"stderrCategories":categories}))
                .unwrap(),
        )
        .unwrap();
        assert!(
            report["response"].is_object(),
            "Native production transport failed; inspect synthetic report"
        );
        assert_eq!(report["healthAfter"], 200);
    }
}
