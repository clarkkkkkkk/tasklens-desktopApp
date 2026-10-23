//! Managed llama.cpp server lifecycle.
//!
//! One `llama-server` process is started on demand, bound to 127.0.0.1 on a free port with a
//! per-launch random API key, reused for every extraction and stopped with TaskLens.
use super::{http, model};
use crate::platform;
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    net::{Ipv4Addr, TcpListener},
    process::{Child, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

/// Cold loads on 8 GB machines under memory pressure can take minutes.
pub(crate) const MODEL_LOAD_BUDGET: Duration = Duration::from_secs(300);

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
    pub fn pid(&self) -> Option<u32> {
        self.process.lock().unwrap().as_ref().map(|s| s.child.id())
    }
    pub fn exit_status(&self) -> Option<std::process::ExitStatus> {
        self.process
            .lock()
            .unwrap()
            .as_mut()
            .and_then(|s| s.child.try_wait().ok().flatten())
    }
    pub fn monitor(&self, trace: Option<String>, job: String) -> Monitor {
        let done = Arc::new(AtomicBool::new(false));
        let flag = done.clone();
        let pid = self.pid();
        if !crate::diagnostics::enabled() {
            return Monitor { done, worker: None };
        }
        let worker = std::thread::spawn(move || {
            let mut last = Instant::now() - Duration::from_secs(5);
            while !flag.load(Ordering::SeqCst) {
                if last.elapsed() >= Duration::from_secs(5) {
                    if let Some(pid) = pid {
                        crate::diagnostics::process_sample(
                            "inference",
                            trace.as_deref(),
                            Some(&job),
                            pid,
                        );
                    }
                    last = Instant::now();
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        });
        Monitor {
            done,
            worker: Some(worker),
        }
    }
    pub fn reconcile(&self, app: &tauri::AppHandle, _request_ok: bool) {
        let healthy = {
            let mut guard = self.process.lock().unwrap();
            guard.as_mut().is_some_and(|server| {
                matches!(server.child.try_wait(), Ok(None))
                    && http::send(
                        http::Request {
                            port: server.port,
                            method: "GET",
                            path: "/health",
                            api_key: Some(&server.key),
                            body: None,
                            timeout: Duration::from_secs(2),
                            cancel: None,
                        },
                        |_| Ok(()),
                    )
                    .is_ok_and(|s| s == 200)
            })
        };
        if healthy {
            self.set(app, State::Ready, "");
        } else {
            self.stop(app);
            self.set(
                app,
                State::Failed,
                "The local model runtime is unavailable. Try again to restart it.",
            );
        }
    }
    pub fn ensure(&self, app: &tauri::AppHandle, config: Config) -> Result<(u16, String), String> {
        self.ensure_with_cancel(app, config, None, None, None)
    }
    pub fn ensure_with_cancel(
        &self,
        app: &tauri::AppHandle,
        config: Config,
        cancel: Option<&AtomicBool>,
        trace: Option<&str>,
        job: Option<&str>,
    ) -> Result<(u16, String), String> {
        let mut process = self.process.lock().unwrap();
        if let Some(server) = process.as_mut() {
            let alive = matches!(server.child.try_wait(), Ok(None));
            let healthy = alive
                && http::send(
                    http::Request {
                        port: server.port,
                        method: "GET",
                        path: "/health",
                        api_key: Some(&server.key),
                        body: None,
                        timeout: Duration::from_secs(2),
                        cancel,
                    },
                    |_| Ok(()),
                )
                .is_ok_and(|s| s == 200);
            if healthy && server.config == config {
                return Ok((server.port, server.key.clone()));
            }
            let _ = server.child.kill();
            let _ = server.child.wait();
            *process = None;
        }
        if self.shutting_down.load(Ordering::SeqCst)
            || cancel.is_some_and(|c| c.load(Ordering::SeqCst))
        {
            return Err(platform::CANCELLED.into());
        }
        let result = self.start(app, config, cancel, trace, job);
        match result {
            Ok(server) => {
                let info = (server.port, server.key.clone());
                *process = Some(server);
                self.set(app, State::Ready, "");
                Ok(info)
            }
            Err(error) => {
                let message = serde_json::from_str::<crate::diagnostics::Failure>(&error)
                    .map(|e| e.message)
                    .unwrap_or_else(|_| error.clone());
                if cancel.is_some_and(|c| c.load(Ordering::SeqCst)) {
                    self.set(app, State::Stopped, "");
                } else {
                    self.set(app, State::Failed, &message);
                }
                Err(error)
            }
        }
    }

    fn start(
        &self,
        app: &tauri::AppHandle,
        config: Config,
        cancel: Option<&AtomicBool>,
        trace: Option<&str>,
        job: Option<&str>,
    ) -> Result<Server, String> {
        let binary = platform::bundled_binary(app, "llama-server").ok_or(
            "RUNTIME_MISSING: The local model runtime (llama.cpp) is not installed in this TaskLens build.",
        )?;
        match model::state(app) {
            model::ModelState::NotInstalled => {
                return Err("MODEL_NOT_INSTALLED: A bundled extraction model is missing. Reinstall TaskLens.".into())
            }
            model::ModelState::Corrupted => {
                return Err("MODEL_CORRUPTED: The bundled extraction model is damaged. Retry validation or reinstall TaskLens.".into())
            }
            model::ModelState::Unverified => {
                self.set(app, State::Loading, "Checking model integrity…");
                model::verify(app, cancel.unwrap_or(&self.shutting_down))?;
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
        if let Some(dir) = prompt_cache_dir(app) {
            args.extend(["--slot-save-path".into(), dir.to_string_lossy().into()]);
        }
        if let Some(threads) = config.threads {
            args.extend(["--threads".into(), threads.to_string()]);
        }
        let load_span =
            crate::diagnostics::Span::new("model_loading", trace, job).runtime("llama-server");
        let mut child = platform::spawn(
            platform::command(&binary)
                .args(&args)
                .current_dir(binary.parent().unwrap_or(std::path::Path::new(".")))
                .stdout(Stdio::null())
                .stderr(Stdio::piped()),
        )
        .map_err(|_| {
            crate::diagnostics::Failure::wire(
                "MODEL_LOAD_FAILED",
                "SPAWN_FAILED",
                "model_loading",
                "The local model runtime could not start.",
            )
        })?;
        if let Some(stderr) = child.stderr.take() {
            let log = self.log.clone();
            log.lock().unwrap().clear();
            let reader = crate::diagnostics::stderr_reader(stderr);
            std::thread::spawn(move || {
                if let Ok(categories) = reader.join() {
                    let mut log = log.lock().unwrap();
                    for category in categories {
                        log.push_back(category.into());
                    }
                }
            });
        }
        let started = Instant::now();
        loop {
            if self.shutting_down.load(Ordering::SeqCst)
                || cancel.is_some_and(|c| c.load(Ordering::SeqCst))
            {
                let _ = child.kill();
                let status = child.wait().ok();
                load_span.finish("CANCELLED", Some(child.id()), status, &[]);
                return Err(platform::CANCELLED.into());
            }
            if let Ok(Some(status)) = child.try_wait() {
                load_span.finish("PROCESS_EXIT", Some(child.id()), Some(status), &[]);
                return Err(crate::diagnostics::Failure::wire("MODEL_LOAD_FAILED","PROCESS_EXIT","model_loading","The local model runtime stopped while loading. Check available memory and try Reload model."));
            }
            if started.elapsed() > MODEL_LOAD_BUDGET {
                let _ = child.kill();
                let status = child.wait().ok();
                load_span.finish("TIMEOUT", Some(child.id()), status, &[]);
                return Err(crate::diagnostics::Failure::wire(
                    "MODEL_LOAD_FAILED",
                    "TIMEOUT",
                    "model_loading",
                    "The local model took too long to load.",
                ));
            }
            let healthy = http::send(
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
            .map(|status| status == 200)
            .unwrap_or(false);
            if healthy {
                load_span.finish("OK", Some(child.id()), None, &[]);
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

/// Directory for llama.cpp slot files: the evaluated fixed prompt prefix, restored after a
/// restart instead of re-evaluating it. Contains model state only, never source text.
pub fn prompt_cache_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let dir = platform::app_data(app).ok()?.join("prompt-cache");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

pub fn runtime(app: &tauri::AppHandle) -> tauri::State<'_, Runtime> {
    app.state::<Runtime>()
}

pub struct Monitor {
    done: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
}
impl Drop for Monitor {
    fn drop(&mut self) {
        self.done.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
