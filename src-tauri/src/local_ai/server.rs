//! Managed llama.cpp server lifecycle.
//!
//! One `llama-server` process is started on demand, bound to 127.0.0.1 on a free port with a
//! per-launch random API key, reused for every extraction and stopped with TaskLens.
use super::{http, model};
use crate::platform;
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    io::{BufRead, BufReader},
    net::{Ipv4Addr, TcpListener},
    process::{Child, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub context_size: u32,
    pub threads: Option<u32>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            context_size: 8192,
            threads: None,
        }
    }
}

impl Config {
    pub fn sanitized(self) -> Self {
        Self {
            context_size: self.context_size.clamp(2048, 32768),
            threads: self.threads.map(|t| t.clamp(1, 64)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum State {
    Stopped,
    Loading,
    Ready,
    Processing,
    Failed,
}

impl State {
    fn as_str(self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Loading => "loading",
            Self::Ready => "ready",
            Self::Processing => "processing",
            Self::Failed => "failed",
        }
    }
}

pub struct Server {
    child: Child,
    pub port: u16,
    pub key: String,
    config: Config,
}

#[derive(Default)]
pub struct Runtime {
    status: Mutex<(Option<State>, String)>,
    process: Mutex<Option<Server>>,
    pub gate: Mutex<()>,
    shutting_down: AtomicBool,
    log: Arc<Mutex<VecDeque<String>>>,
}

impl Runtime {
    pub fn set(&self, app: &tauri::AppHandle, state: State, message: &str) {
        *self.status.lock().unwrap() = (Some(state), message.to_string());
        let _ = app.emit("local-ai-status", self.status_json());
    }

    pub fn status_json(&self) -> Value {
        let (state, message) = self.status.lock().unwrap().clone();
        json!({"state": state.unwrap_or(State::Stopped).as_str(), "message": message})
    }

    /// Recent runtime log lines for developer diagnostics. llama-server's default log level
    /// does not print prompt or generated text.
    pub fn log_tail(&self) -> Vec<String> {
        self.log.lock().unwrap().iter().cloned().collect()
    }

    pub fn stop(&self, app: &tauri::AppHandle) {
        if let Some(mut server) = self.process.lock().unwrap().take() {
            let _ = server.child.kill();
            let _ = server.child.wait();
        }
        self.set(app, State::Stopped, "");
    }

    pub fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        let guard = self.process.try_lock();
        if let Ok(mut process) = guard {
            if let Some(mut server) = process.take() {
                let _ = server.child.kill();
                let _ = server.child.wait();
            }
        }
    }

    /// Returns a ready server, starting or restarting one when needed.
    pub fn ensure(&self, app: &tauri::AppHandle, config: Config) -> Result<(u16, String), String> {
        let mut process = self.process.lock().unwrap();
        if let Some(server) = process.as_mut() {
            let alive = matches!(server.child.try_wait(), Ok(None));
            if alive && server.config == config {
                return Ok((server.port, server.key.clone()));
            }
            let _ = server.child.kill();
            let _ = server.child.wait();
            *process = None;
        }
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err(platform::CANCELLED.into());
        }
        let result = self.start(app, config);
        match result {
            Ok(server) => {
                let info = (server.port, server.key.clone());
                *process = Some(server);
                self.set(app, State::Ready, "");
                Ok(info)
            }
            Err(error) => {
                self.set(app, State::Failed, &error);
                Err(error)
            }
        }
    }

    fn start(&self, app: &tauri::AppHandle, config: Config) -> Result<Server, String> {
        let binary = platform::bundled_binary(app, "llama-server").ok_or(
            "RUNTIME_MISSING: The local model runtime (llama.cpp) is not installed in this TaskLens build.",
        )?;
        match model::state(app) {
            model::ModelState::NotInstalled => {
                return Err("MODEL_NOT_INSTALLED: The local model is not installed.".into())
            }
            model::ModelState::Corrupted => {
                return Err("MODEL_CORRUPTED: The model file is damaged or not the supported build. Import it again.".into())
            }
            model::ModelState::Unverified => {
                self.set(app, State::Loading, "Checking model integrity…");
                model::verify(app, &self.shutting_down)?;
            }
            model::ModelState::Verified => {}
        }
        self.set(app, State::Loading, "Loading model…");
        let port = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .and_then(|l| l.local_addr())
            .map(|a| a.port())
            .map_err(|_| "MODEL_LOAD_FAILED: No local port is available for the model runtime.")?;
        let key = uuid::Uuid::new_v4().simple().to_string();
        let model_path = model::path(app)?;
        let mut args: Vec<String> = vec![
            "--model".into(),
            model_path.to_string_lossy().into(),
            "--host".into(),
            "127.0.0.1".into(),
            "--port".into(),
            port.to_string(),
            "--api-key".into(),
            key.clone(),
            "--ctx-size".into(),
            config.context_size.to_string(),
            "--parallel".into(),
            "1".into(),
            "--n-gpu-layers".into(),
            "0".into(),
            "--no-webui".into(),
        ];
        if let Some(threads) = config.threads {
            args.extend(["--threads".into(), threads.to_string()]);
        }
        let mut child = platform::command(&binary)
            .args(&args)
            .current_dir(binary.parent().unwrap_or(std::path::Path::new(".")))
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| "MODEL_LOAD_FAILED: The local model runtime could not start.")?;
        if let Some(stderr) = child.stderr.take() {
            let log = self.log.clone();
            log.lock().unwrap().clear();
            std::thread::spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    let mut log = log.lock().unwrap();
                    if log.len() >= 60 {
                        log.pop_front();
                    }
                    log.push_back(line.chars().take(400).collect());
                }
            });
        }
        let started = Instant::now();
        loop {
            if self.shutting_down.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(platform::CANCELLED.into());
            }
            if let Ok(Some(_)) = child.try_wait() {
                return Err("MODEL_LOAD_FAILED: The local model runtime stopped while loading. Check available memory and try Reload model.".into());
            }
            if started.elapsed() > Duration::from_secs(300) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("MODEL_LOAD_FAILED: The local model took too long to load.".into());
            }
            let healthy = http::send(
                http::Request {
                    port,
                    method: "GET",
                    path: "/health",
                    api_key: &key,
                    body: None,
                    timeout: Duration::from_secs(2),
                    cancel: None,
                },
                |_| Ok(()),
            )
            .map(|status| status == 200)
            .unwrap_or(false);
            if healthy {
                return Ok(Server {
                    child,
                    port,
                    key,
                    config,
                });
            }
            std::thread::sleep(Duration::from_millis(300));
        }
    }
}

pub fn runtime(app: &tauri::AppHandle) -> tauri::State<'_, Runtime> {
    app.state::<Runtime>()
}
