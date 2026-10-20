//! A local Ollama server, reached only on 127.0.0.1:11434 through the loopback HTTP client.
//!
//! Discovery reads model names, sizes, quantization, context length and capabilities so the
//! router can judge each model from detected facts. Chat requests are built by the TypeScript
//! adapter; Rust forces streaming, bounds sizes and supports cancellation.
use crate::local_ai::http;
use serde_json::{json, Value};
use std::{
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};

pub const PORT: u16 = 11434;
const MAX_MODELS: usize = 24;
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

fn request(
    method: &str,
    path: &str,
    body: Option<&[u8]>,
    timeout: Duration,
    cancel: Option<&AtomicBool>,
    mut sink: impl FnMut(&[u8]) -> std::io::Result<()>,
) -> std::io::Result<u16> {
    http::send(
        http::Request {
            port: PORT,
            method,
            path,
            api_key: None,
            body,
            timeout,
            cancel,
        },
        |bytes| sink(bytes),
    )
}

fn get_json(method: &str, path: &str, body: Option<Value>) -> Option<Value> {
    let mut buffer = Vec::new();
    let payload = body.map(|b| b.to_string());
    let status = request(
        method,
        path,
        payload.as_deref().map(str::as_bytes),
        Duration::from_secs(3),
        None,
        |bytes| {
            if buffer.len() + bytes.len() > MAX_RESPONSE_BYTES {
                return Err(std::io::Error::other("response too large"));
            }
            buffer.extend_from_slice(bytes);
            Ok(())
        },
    )
    .ok()?;
    (status == 200)
        .then(|| serde_json::from_slice(&buffer).ok())
        .flatten()
}

/// Context length from `/api/show` model_info, e.g. `"qwen2.context_length": 32768`.
pub fn context_length(show: &Value) -> Option<u64> {
    show["model_info"]
        .as_object()?
        .iter()
        .find(|(k, _)| k.ends_with(".context_length"))
        .and_then(|(_, v)| v.as_u64())
}

pub fn model_entry(tag: &Value, show: Option<&Value>) -> Option<Value> {
    let name = tag["name"].as_str().or_else(|| tag["model"].as_str())?;
    let details = &tag["details"];
    Some(json!({
        "name": name,
        "sizeBytes": tag["size"].as_u64().unwrap_or(0),
        "parameterSize": details["parameter_size"].as_str(),
        "quantization": details["quantization_level"].as_str(),
        "family": details["family"].as_str(),
        "capabilities": show.and_then(|s| s["capabilities"].as_array()).map(|caps| {
            caps.iter().filter_map(|c| c.as_str()).map(str::to_string).collect::<Vec<_>>()
        }),
        "contextLength": show.and_then(context_length),
    }))
}

pub fn discover() -> Value {
    let Some(version) = get_json("GET", "/api/version", None) else {
        return json!({ "running": false, "models": [] });
    };
    let tags = get_json("GET", "/api/tags", None).unwrap_or(Value::Null);
    let models: Vec<Value> = tags["models"]
        .as_array()
        .map(|list| {
            list.iter()
                .take(MAX_MODELS)
                .filter_map(|tag| {
                    let name = tag["name"].as_str()?;
                    let show = get_json("POST", "/api/show", Some(json!({ "model": name })));
                    model_entry(tag, show.as_ref())
                })
                .collect()
        })
        .unwrap_or_default();
    json!({ "running": true, "version": version["version"].as_str(), "models": models })
}

/// Splits Ollama's newline-delimited JSON stream.
#[derive(Default)]
pub struct NdjsonParser {
    pending: Vec<u8>,
}

impl NdjsonParser {
    pub fn push(&mut self, bytes: &[u8], mut on_event: impl FnMut(Value)) {
        self.pending.extend_from_slice(bytes);
        while let Some(end) = self.pending.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = self.pending.drain(..=end).collect();
            if let Ok(event) = serde_json::from_slice::<Value>(&line) {
                on_event(event);
            }
        }
    }
}

pub fn chat(mut body: Value, cancel: &AtomicBool) -> Result<Value, String> {
    if !body.is_object() || !body["model"].is_string() {
        return Err("MODEL_FAILED: The Ollama request is incomplete.".into());
    }
    body["stream"] = json!(true);
    let payload = body.to_string();
    let started = Instant::now();
    let mut parser = NdjsonParser::default();
    let (mut content, mut truncated, mut error) = (String::new(), false, None::<String>);
    let mut raw = Vec::new();
    let status = request(
        "POST",
        "/api/chat",
        Some(payload.as_bytes()),
        Duration::from_secs(900),
        Some(cancel),
        |bytes| {
            if raw.len() < 4096 {
                raw.extend_from_slice(&bytes[..bytes.len().min(4096)]);
            }
            parser.push(bytes, |event| {
                if let Some(text) = event["message"]["content"].as_str() {
                    content.push_str(text);
                }
                if let Some(message) = event["error"].as_str() {
                    error = Some(message.chars().take(200).collect());
                }
                if event["done"].as_bool() == Some(true) {
                    truncated = event["done_reason"].as_str() == Some("length");
                }
            });
            if content.len() > MAX_RESPONSE_BYTES {
                return Err(std::io::Error::other("response too large"));
            }
            Ok(())
        },
    )
    .map_err(|e| {
        if e.to_string() == http::CANCELLED_IO {
            crate::platform::CANCELLED.to_string()
        } else {
            "MODEL_FAILED: Ollama did not respond. Check that it is still running.".to_string()
        }
    })?;
    if status != 200 || error.is_some() {
        let detail = error.or_else(|| {
            serde_json::from_slice::<Value>(&raw)
                .ok()
                .and_then(|v| v["error"].as_str().map(|s| s.chars().take(200).collect()))
        });
        return Err(format!(
            "MODEL_FAILED: Ollama could not run this request{}",
            detail
                .map(|d| format!(" ({d})."))
                .unwrap_or_else(|| ".".into())
        ));
    }
    Ok(json!({
        "content": content,
        "truncated": truncated,
        "elapsedMs": started.elapsed().as_millis() as u64,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_detected_model_facts() {
        let tag = json!({
            "name": "qwen2.5vl:7b",
            "size": 6_000_000_000u64,
            "details": { "family": "qwen25vl", "parameter_size": "8.3B", "quantization_level": "Q4_K_M" }
        });
        let show = json!({
            "capabilities": ["completion", "vision"],
            "model_info": { "general.architecture": "qwen25vl", "qwen25vl.context_length": 128000 }
        });
        let entry = model_entry(&tag, Some(&show)).unwrap();
        assert_eq!(entry["name"], "qwen2.5vl:7b");
        assert_eq!(entry["parameterSize"], "8.3B");
        assert_eq!(entry["quantization"], "Q4_K_M");
        assert_eq!(entry["capabilities"], json!(["completion", "vision"]));
        assert_eq!(entry["contextLength"], 128000);
        assert_eq!(
            model_entry(&tag, None).unwrap()["capabilities"],
            Value::Null
        );
    }

    #[test]
    fn parses_split_ndjson_stream() {
        let mut parser = NdjsonParser::default();
        let mut events = Vec::new();
        for part in [
            "{\"message\":{\"content\":\"{\\\"a\\\"\"},\"done\":false}\n{\"mess",
            "age\":{\"content\":\":1}\"},\"done\":true,\"done_reason\":\"length\"}\n",
        ] {
            parser.push(part.as_bytes(), |e| events.push(e));
        }
        assert_eq!(events.len(), 2);
        assert_eq!(events[1]["done_reason"], "length");
    }
}
