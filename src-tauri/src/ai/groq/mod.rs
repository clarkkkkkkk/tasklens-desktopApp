//! Optional BYOK extraction. All remote URLs and authentication are owned by Rust.
mod credentials;
mod limits;

use credentials::CredentialFailure;
use limits::{now_ms, today, Config, CONSENT_VERSION};
use reqwest::{header::HeaderMap, Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::Emitter;
use tokio::sync::Mutex;
use zeroize::Zeroizing;

const BASE: &str = "https://api.groq.com/openai/v1";
const MODEL: &str = "openai/gpt-oss-20b";
const MAX_BYTES: usize = 64 * 1024;
const MAX_RESPONSE: usize = 256 * 1024;
const MAX_INPUT_TOKENS: usize = 8192;
const MAX_OUTPUT: u32 = 4096;

type Result<T> = std::result::Result<T, Failure>;
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    pub code: String,
    pub message: String,
    pub retry_at: Option<i64>,
}
impl Failure {
    fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retry_at: None,
        }
    }
    fn storage() -> Self {
        Self::new("GROQ_STORAGE", "TaskLens could not safely read or save Groq usage settings. Cloud processing is paused.")
    }
    fn cancelled() -> Self {
        Self::new(
            "CANCELLED",
            "Online processing was cancelled. A request already sent may still use Groq quota.",
        )
    }
    fn rate(at: i64) -> Self {
        Self { retry_at: Some(at), ..Self::new("GROQ_RATE_LIMIT", "Groq processing is waiting for a rate-limit reset. You can retry after the displayed time.") }
    }
}
fn network(error: reqwest::Error) -> Failure {
    if error.is_timeout() {
        Failure::new(
            "GROQ_TIMEOUT",
            "Groq did not respond in time. Your source is retained; retry when ready.",
        )
    } else {
        Failure::new(
            "GROQ_NETWORK",
            "Could not reach Groq. Check your internet connection and retry.",
        )
    }
}
fn http_error(status: StatusCode) -> Failure {
    match status.as_u16() {
        401 => Failure::new(
            "GROQ_INVALID_KEY",
            "Groq rejected this API key. Connect a valid key in Settings.",
        ),
        403 | 404 => Failure::new(
            "GROQ_MODEL_UNAVAILABLE",
            "The Groq model is unavailable for this key. Check your Groq model permissions.",
        ),
        429 => Failure::rate(now_ms() + 60_000),
        400 | 422 => Failure::new(
            "GROQ_REQUEST_REJECTED",
            "Groq rejected the extraction request or structured-output schema. Nothing was saved.",
        ),
        _ => Failure::new(
            "GROQ_UNAVAILABLE",
            "Groq could not complete this request. Your source is retained; retry later.",
        ),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    connected: bool,
    storage: &'static str,
    consent: bool,
    enabled: bool,
    daily_used: u32,
    daily_limit: u32,
    retry_at: Option<i64>,
    removal_incomplete: bool,
    remaining_tokens: Option<u64>,
}
struct Session {
    fingerprint: String,
    cancel: Arc<AtomicBool>,
    active: bool,
    gate: Arc<Mutex<()>>,
}
struct Inner {
    config: Config,
    config_error: bool,
    key: Option<Zeroizing<String>>,
    loaded: bool,
    storage: &'static str,
    enabled: bool,
    sessions: HashMap<String, Session>,
    queue: VecDeque<String>,
    early: HashSet<String>,
    remaining_tokens: Option<u64>,
    token_reset: i64,
    remaining_requests: Option<u64>,
    request_reset: i64,
}
pub struct Groq {
    credentials: Arc<dyn credentials::Store>,
    #[cfg(test)]
    test_clock: Option<Arc<std::sync::atomic::AtomicI64>>,
    #[cfg(test)]
    test_base: Option<String>,
    inner: Mutex<Inner>,
    credential_gate: Mutex<()>,
    path: PathBuf,
    client: Client,
}
impl Groq {
    pub fn new(path: PathBuf) -> std::result::Result<Self, reqwest::Error> {
        let config = Config::load(&path);
        let config_error = config.is_err();
        Ok(Self {
            credentials: Arc::new(credentials::OsStore),
            #[cfg(test)]
            test_clock: None,
            #[cfg(test)]
            test_base: None,
            path,
            client: Client::builder()
                .https_only(true)
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(60))
                .build()?,
            credential_gate: Mutex::new(()),
            inner: Mutex::new(Inner {
                config: config.unwrap_or_default(),
                config_error,
                key: None,
                loaded: false,
                storage: "none",
                enabled: false,
                sessions: HashMap::new(),
                queue: VecDeque::new(),
                early: HashSet::new(),
                remaining_tokens: None,
                token_reset: 0,
                remaining_requests: None,
                request_reset: 0,
            }),
        })
    }
    async fn load_key(&self) {
        let _gate = self.credential_gate.lock().await;
        {
            let mut inner = self.inner.lock().await;
            if inner.loaded {
                return;
            }
            inner.loaded = true;
            if inner.config_error
                || !inner.config.credential_enabled
                || inner.config.removal_incomplete
            {
                return;
            }
        }
        let store = self.credentials.clone();
        let stored = tauri::async_runtime::spawn_blocking(move || store.read()).await;
        let mut inner = self.inner.lock().await;
        if let Ok(Ok(key)) = stored {
            inner.key = Some(key);
            inner.storage = "persistent";
        }
    }
    async fn status(&self) -> Status {
        self.load_key().await;
        let mut inner = self.inner.lock().await;
        inner.config.refresh(self.now(), &today());
        let now = self.now();
        let retry_at = inner.config.next_allowed(now).ok().filter(|at| *at > now);
        Status {
            connected: inner.key.is_some() && !inner.config_error,
            storage: inner.storage,
            consent: inner.config.consent_version == CONSENT_VERSION,
            enabled: inner.enabled,
            daily_used: inner.config.daily,
            daily_limit: 10,
            retry_at,
            removal_incomplete: inner.config.removal_incomplete,
            remaining_tokens: if inner.token_reset > now {
                inner.remaining_tokens
            } else {
                None
            },
        }
    }
    fn save(&self, inner: &mut Inner) -> Result<()> {
        if inner.config_error {
            return Err(Failure::storage());
        }
        if let Err(error) = inner.config.save(&self.path) {
            inner.config_error = true;
            return Err(error);
        }
        Ok(())
    }
    fn now(&self) -> i64 {
        #[cfg(test)]
        if let Some(clock) = &self.test_clock {
            return clock.load(Ordering::SeqCst);
        }
        now_ms()
    }
    fn url(&self, path: &str) -> String {
        #[cfg(test)]
        if let Some(base) = &self.test_base {
            return format!("{base}{path}");
        }
        format!("{BASE}{path}")
    }
    async fn verify_key(&self, key: &str) -> Result<()> {
        let response = self
            .client
            .get(self.url("/models"))
            .bearer_auth(key)
            .send()
            .await
            .map_err(network)?;
        if !response.status().is_success() {
            return Err(http_error(response.status()));
        }
        let body = read_bounded(response).await?;
        let model: Value = serde_json::from_slice(&body).map_err(|_| invalid_output())?;
        if !model["data"]
            .as_array()
            .is_some_and(|models| models.iter().any(|item| item["id"].as_str() == Some(MODEL)))
        {
            return Err(Failure::new(
                "GROQ_MODEL_UNAVAILABLE",
                "Groq did not confirm the configured extraction model.",
            ));
        }
        Ok(())
    }
    async fn cancel_all(&self) {
        let mut inner = self.inner.lock().await;
        for session in inner.sessions.values() {
            session.cancel.store(true, Ordering::SeqCst);
        }
        inner
            .sessions
            .retain(|_, session| session.active && session.gate.try_lock().is_err());
        inner.queue.clear();
    }
    async fn finish(&self, id: &str) {
        let mut inner = self.inner.lock().await;
        if let Some(s) = inner.sessions.get(id) {
            s.cancel.store(true, Ordering::SeqCst);
            if s.gate.try_lock().is_err() {
                return;
            }
            inner.sessions.remove(id);
        } else {
            if inner.early.len() >= 64 {
                inner.early.clear();
            }
            inner.early.insert(id.into());
        }
        inner.queue.retain(|queued| queued != id);
    }
    async fn reserve(&self, id: &str, estimated: u64) -> Result<()> {
        let mut inner = self.inner.lock().await;
        check_enabled(&inner)?;
        check_session(&inner, id)?;
        if inner.config_error {
            return Err(Failure::storage());
        }
        let now = self.now();
        if inner.token_reset > now && inner.remaining_tokens.is_some_and(|left| left < estimated) {
            return Err(Failure::rate(inner.token_reset));
        }
        if inner.request_reset > now && inner.remaining_requests == Some(0) {
            return Err(Failure::rate(inner.request_reset));
        }
        inner.config.reserve(&self.path, now, &today())?;
        // Reserve known provider capacity too; unknown is never advertised as available quota.
        inner.remaining_tokens = inner
            .remaining_tokens
            .map(|left| left.saturating_sub(estimated));
        inner.remaining_requests = inner.remaining_requests.map(|left| left.saturating_sub(1));
        Ok(())
    }
    async fn headers(&self, headers: &HeaderMap, limited: bool, attempt: u32) -> Result<i64> {
        let mut inner = self.inner.lock().await;
        let now = self.now();
        let value = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
        inner.remaining_tokens = value("x-ratelimit-remaining-tokens").and_then(|s| s.parse().ok());
        inner.remaining_requests =
            value("x-ratelimit-remaining-requests").and_then(|s| s.parse().ok());
        inner.token_reset = value("x-ratelimit-reset-tokens")
            .and_then(limits::duration_ms)
            .map_or(0, |ms| now + ms);
        inner.request_reset = value("x-ratelimit-reset-requests")
            .and_then(limits::duration_ms)
            .map_or(0, |ms| now + ms);
        if !limited {
            return Ok(now);
        }
        let retry = value("retry-after").and_then(|v| {
            v.parse::<f64>()
                .ok()
                .filter(|n| n.is_finite() && *n >= 0. && *n <= 604800.)
                .map(|seconds| now + (seconds * 1000.).ceil() as i64)
                .or_else(|| {
                    chrono::DateTime::parse_from_rfc2822(v)
                        .ok()
                        .map(|d| d.timestamp_millis())
                })
        });
        let jitter = (uuid::Uuid::new_v4().as_u128() % 501) as i64;
        let mut at = now + (2000i64 << attempt.min(2)) + jitter;
        if let Some(retry) = retry {
            at = at.max(retry);
        }
        if inner.remaining_tokens == Some(0) {
            at = at.max(inner.token_reset);
        }
        if inner.remaining_requests == Some(0) {
            at = at.max(inner.request_reset);
        }
        // Header-less 429s still receive bounded exponential backoff.
        inner.config.cooldown_until = inner.config.cooldown_until.max(at);
        self.save(&mut inner)?;
        Ok(at)
    }
}
fn invalid_output() -> Failure {
    Failure::new("GROQ_INVALID_OUTPUT", "Groq returned an invalid or incomplete extraction. Your source is retained; nothing was saved.")
}
fn check_enabled(inner: &Inner) -> Result<()> {
    if inner.config_error {
        return Err(Failure::storage());
    }
    if !inner.enabled {
        return Err(Failure::new(
            "GROQ_DISABLED",
            "Select Groq Cloud in Settings before online extraction.",
        ));
    }
    if inner.config.consent_version != CONSENT_VERSION {
        return Err(Failure::new(
            "GROQ_CONSENT",
            "Review the Groq privacy disclosure in Settings before sending source text.",
        ));
    }
    if inner.key.is_none() {
        return Err(Failure::new(
            "GROQ_INVALID_KEY",
            "Connect your own Groq API key in Settings.",
        ));
    }
    Ok(())
}
fn check_session<'a>(inner: &'a Inner, id: &str) -> Result<&'a Session> {
    match inner.sessions.get(id) {
        Some(session) if session.active && !session.cancel.load(Ordering::SeqCst) => Ok(session),
        _ => Err(Failure::cancelled()),
    }
}
fn check_window(window: &tauri::Window) -> Result<()> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err(Failure::new(
            "GROQ_FORBIDDEN",
            "Groq is available only in the main TaskLens window.",
        ))
    }
}
async fn read_bounded(mut response: Response) -> Result<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE as u64)
    {
        return Err(invalid_output());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network)? {
        if bytes.len() + chunk.len() > MAX_RESPONSE {
            return Err(invalid_output());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
async fn cancelled(cancel: &AtomicBool) {
    while !cancel.load(Ordering::SeqCst) {
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}
fn progress(app: &tauri::AppHandle, id: &str, stage: &str, retry_at: Option<i64>) {
    let _ = app.emit_to(
        "main",
        "groq-progress",
        json!({"id":id,"stage":stage,"retryAt":retry_at}),
    );
}

#[tauri::command]
pub async fn groq_status(window: tauri::Window, state: tauri::State<'_, Groq>) -> Result<Status> {
    check_window(&window)?;
    Ok(state.status().await)
}
#[tauri::command]
pub async fn groq_connect(
    window: tauri::Window,
    state: tauri::State<'_, Groq>,
    key: String,
) -> Result<Status> {
    check_window(&window)?;
    state.connect_key(key).await
}
impl Groq {
    async fn connect_key(&self, key: String) -> Result<Status> {
        let key = Zeroizing::new(key);
        if key.trim() != key.as_str()
            || key.len() < 12
            || key.len() > 512
            || !key.bytes().all(|b| b.is_ascii_graphic())
        {
            return Err(Failure::new(
                "GROQ_INVALID_KEY",
                "Enter a valid Groq API key without spaces.",
            ));
        }
        {
            let _gate = self.credential_gate.lock().await;
            self.verify_key(&key).await?;
            self.cancel_all().await;
            // Persist the disabled marker first, so a failed keychain operation never reactivates an old key.
            {
                let mut inner = self.inner.lock().await;
                inner.config.credential_enabled = false;
                self.save(&mut inner)?;
            }
            let to_store = key.clone();
            let store = self.credentials.clone();
            let stored = tauri::async_runtime::spawn_blocking(move || store.write(&to_store)).await;
            let persistent = matches!(stored, Ok(Ok(())));
            let mut inner = self.inner.lock().await;
            inner.key = Some(key);
            inner.loaded = true;
            inner.storage = if persistent { "persistent" } else { "session" };
            inner.config.credential_enabled = persistent;
            if persistent {
                inner.config.removal_incomplete = false;
            }
            self.save(&mut inner)?;
        }
        Ok(self.status().await)
    }
}

#[tauri::command]
pub async fn groq_verify(window: tauri::Window, state: tauri::State<'_, Groq>) -> Result<Status> {
    check_window(&window)?;
    state.load_key().await;
    let _gate = state.credential_gate.lock().await;
    let key = state
        .inner
        .lock()
        .await
        .key
        .clone()
        .ok_or_else(|| Failure::new("GROQ_INVALID_KEY", "Connect a Groq API key first."))?;
    state.verify_key(&key).await?;
    // Avoid recursively acquiring the credential lock in status().
    drop(_gate);
    Ok(state.status().await)
}
#[tauri::command]
pub async fn groq_disconnect(
    window: tauri::Window,
    state: tauri::State<'_, Groq>,
) -> Result<Status> {
    check_window(&window)?;
    state.disconnect_key().await
}
impl Groq {
    async fn disconnect_key(&self) -> Result<Status> {
        self.cancel_all().await;
        let _gate = self.credential_gate.lock().await;
        let disabled = {
            let mut inner = self.inner.lock().await;
            inner.key = None;
            inner.storage = "none";
            inner.loaded = true;
            inner.enabled = false;
            inner.config.credential_enabled = false;
            inner.config.consent_version = 0;
            inner.config.removal_incomplete = true;
            self.save(&mut inner)
        };
        let store = self.credentials.clone();
        let removal = tauri::async_runtime::spawn_blocking(move || store.remove()).await;
        if matches!(removal, Ok(Ok(())) | Ok(Err(CredentialFailure::Missing))) {
            let mut inner = self.inner.lock().await;
            inner.config.removal_incomplete = false;
            if disabled.is_ok() {
                self.save(&mut inner)?;
            }
        }
        drop(_gate);
        disabled?;
        Ok(self.status().await)
    }
}

#[tauri::command]
pub async fn groq_configure(
    window: tauri::Window,
    state: tauri::State<'_, Groq>,
    enabled: bool,
    consent: bool,
) -> Result<Status> {
    check_window(&window)?;
    if !enabled {
        state.cancel_all().await;
    }
    {
        let mut inner = state.inner.lock().await;
        if consent {
            inner.config.consent_version = CONSENT_VERSION;
            state.save(&mut inner)?;
        }
        inner.enabled = enabled;
    }
    Ok(state.status().await)
}
#[tauri::command]
pub async fn groq_begin(
    window: tauri::Window,
    app: tauri::AppHandle,
    state: tauri::State<'_, Groq>,
    id: String,
    fingerprint: String,
) -> Result<()> {
    check_window(&window)?;
    state
        .begin(id.clone(), fingerprint, |stage, at| {
            progress(&app, &id, stage, at)
        })
        .await
}
impl Groq {
    async fn begin(
        &self,
        id: String,
        fingerprint: String,
        report: impl Fn(&str, Option<i64>) + Send + Sync,
    ) -> Result<()> {
        crate::jobs::valid_id(&id)
            .map_err(|_| Failure::new("GROQ_REQUEST_REJECTED", "Invalid extraction identifier."))?;
        if fingerprint.len() > MAX_BYTES {
            return Err(invalid_output());
        }
        let fingerprint = format!("{:x}", Sha256::digest(fingerprint.as_bytes()));
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut inner = self.inner.lock().await;
            check_enabled(&inner)?;
            if inner.early.remove(&id) {
                return Err(Failure::cancelled());
            }
            if inner.sessions.contains_key(&id)
                || inner
                    .sessions
                    .values()
                    .any(|s| s.fingerprint == fingerprint)
            {
                return Err(Failure::new(
                    "GROQ_DUPLICATE",
                    "This extraction is already active or waiting.",
                ));
            }
            let active = inner.sessions.values().any(|s| s.active);
            if (active && inner.queue.len() >= 2) || inner.sessions.len() >= 3 {
                return Err(Failure::new("GROQ_QUEUE_FULL", "One Groq extraction is active and two are already waiting. Retry after one finishes."));
            }
            let immediate = !active && inner.queue.is_empty();
            inner.sessions.insert(
                id.clone(),
                Session {
                    fingerprint,
                    cancel: cancel.clone(),
                    active: immediate,
                    gate: Arc::new(Mutex::new(())),
                },
            );
            if immediate {
                return Ok(());
            }
            inner.queue.push_back(id.clone());
        }
        report("queued", None);
        loop {
            if cancel.load(Ordering::SeqCst) {
                self.finish(&id).await;
                return Err(Failure::cancelled());
            }
            {
                let mut inner = self.inner.lock().await;
                if !inner.sessions.values().any(|s| s.active) && inner.queue.front() == Some(&id) {
                    inner.queue.pop_front();
                    if let Some(session) = inner.sessions.get_mut(&id) {
                        session.active = true;
                        return Ok(());
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    }
}

#[tauri::command]
pub async fn groq_finish(
    window: tauri::Window,
    state: tauri::State<'_, Groq>,
    id: String,
) -> Result<()> {
    check_window(&window)?;
    state.finish(&id).await;
    Ok(())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Generate {
    system: String,
    user: String,
    schema: Value,
    max_output_tokens: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Generated {
    content: String,
    truncated: bool,
    elapsed_ms: u128,
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    can_repair: bool,
}
fn request_body(request: Generate) -> Result<(Value, u64)> {
    if request.system.len() + request.user.len() + request.schema.to_string().len() > MAX_BYTES {
        return Err(Failure::new("GROQ_INPUT_LIMIT", "This source is too long for online extraction. Use a smaller capture or create tasks manually."));
    }
    let estimated = (request.system.chars().count()
        + request.user.chars().count()
        + request.schema.to_string().chars().count())
    .div_ceil(3)
        + 128;
    if estimated > MAX_INPUT_TOKENS
        || request.max_output_tokens == 0
        || request.max_output_tokens > MAX_OUTPUT
    {
        return Err(Failure::new(
            "GROQ_INPUT_LIMIT",
            "This source exceeds TaskLens’s online token budget. Use a smaller capture.",
        ));
    }
    let body = json!({"model":MODEL,"messages":[{"role":"system","content":request.system},{"role":"user","content":request.user}],
        "response_format":{"type":"json_schema","json_schema":{"name":"tasklens_extraction","strict":true,"schema":request.schema}},
        "max_completion_tokens":request.max_output_tokens,"stream":false,"reasoning_effort":"low"});
    if body.to_string().len() > MAX_BYTES {
        return Err(Failure::new(
            "GROQ_INPUT_LIMIT",
            "This source exceeds TaskLens’s online request size limit.",
        ));
    }
    Ok((body, estimated as u64))
}
#[tauri::command]
pub async fn groq_generate(
    window: tauri::Window,
    app: tauri::AppHandle,
    state: tauri::State<'_, Groq>,
    id: String,
    request: Generate,
) -> Result<Generated> {
    check_window(&window)?;
    let result = state
        .generate(&id, request, |stage, at| progress(&app, &id, stage, at))
        .await;
    if result
        .as_ref()
        .err()
        .is_some_and(|error| error.code == "CANCELLED")
    {
        state.finish(&id).await;
    }
    result
}
impl Groq {
    async fn generate(
        &self,
        id: &str,
        request: Generate,
        report: impl Fn(&str, Option<i64>) + Send + Sync,
    ) -> Result<Generated> {
        let output = request.max_output_tokens as u64;
        let (body, estimated) = request_body(request)?;
        let (cancel, gate) = {
            let inner = self.inner.lock().await;
            check_enabled(&inner)?;
            let session = check_session(&inner, &id)?;
            (session.cancel.clone(), session.gate.clone())
        };
        let _request_guard = gate.try_lock_owned().map_err(|_| {
            Failure::new(
                "GROQ_DUPLICATE",
                "This extraction already has an active request.",
            )
        })?;
        for attempt in 0..=2 {
            loop {
                if cancel.load(Ordering::SeqCst) {
                    return Err(Failure::cancelled());
                }
                match self.reserve(&id, estimated + output).await {
                    Ok(()) => break,
                    Err(error) if error.code == "GROQ_RATE_LIMIT" => {
                        let at = error.retry_at.unwrap_or(self.now() + 60_000);
                        if at - self.now() > 120_000 {
                            return Err(error);
                        }
                        report("waiting", Some(at));
                        tokio::select! { _ = cancelled(&cancel) => return Err(Failure::cancelled()), _ = tokio::time::sleep(Duration::from_millis((at - self.now()).max(1) as u64)) => {} }
                    }
                    Err(error) => return Err(error),
                }
            }
            let key = {
                let inner = self.inner.lock().await;
                check_enabled(&inner)?;
                check_session(&inner, &id)?;
                inner.key.clone().ok_or_else(Failure::cancelled)?
            };
            report("sending", None);
            let exchange_started = Instant::now();
            let exchange = async {
                let response = self
                    .client
                    .post(self.url("/chat/completions"))
                    .bearer_auth(key.as_str())
                    .json(&body)
                    .send()
                    .await
                    .map_err(network)?;
                let status = response.status();
                let retry_at = self
                    .headers(
                        response.headers(),
                        status == StatusCode::TOO_MANY_REQUESTS,
                        attempt,
                    )
                    .await?;
                if status == StatusCode::TOO_MANY_REQUESTS {
                    return Err(Failure::rate(retry_at));
                }
                if !status.is_success() {
                    return Err(http_error(status));
                }
                let bytes = read_bounded(response).await?;
                let json: Value = serde_json::from_slice(&bytes).map_err(|_| invalid_output())?;
                let choice = &json["choices"][0];
                if !choice["message"]["refusal"].is_null() {
                    return Err(invalid_output());
                }
                let content = choice["message"]["content"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .ok_or_else(invalid_output)?;
                // A provider must never be able to echo the submitted credential into the UI.
                if content.contains(key.as_str()) {
                    return Err(invalid_output());
                }
                let finish = choice["finish_reason"].as_str();
                if !matches!(finish, Some("stop") | Some("length")) {
                    return Err(invalid_output());
                }
                let inner = self.inner.lock().await;
                let can_repair = inner.config.daily < 10
                    && !inner.remaining_tokens.is_some_and(|left| {
                        inner.token_reset > self.now() && left < estimated + output
                    });
                Ok(Generated {
                    content: content.into(),
                    truncated: finish == Some("length"),
                    elapsed_ms: exchange_started.elapsed().as_millis(),
                    input_tokens: json["usage"]["prompt_tokens"].as_u64(),
                    output_tokens: json["usage"]["completion_tokens"].as_u64(),
                    can_repair,
                })
            };
            let result = tokio::select! { _ = cancelled(&cancel) => return Err(Failure::cancelled()), result = exchange => result };
            if cancel.load(Ordering::SeqCst) {
                return Err(Failure::cancelled());
            }
            match result {
                Err(error)
                    if error.code == "GROQ_RATE_LIMIT"
                        && attempt < 2
                        && error.retry_at.is_some_and(|at| at - self.now() <= 120_000) =>
                {
                    report("waiting", error.retry_at);
                    // reserve() observes the persisted cooldown and application limits.
                }
                result => return result,
            }
        }
        unreachable!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn body_is_fixed_and_rejects_unexpected_media() {
        assert!(serde_json::from_value::<Generate>(
            json!({"system":"a","user":"b","schema":{},"maxOutputTokens":1,"images":["private"]})
        )
        .is_err());
        let (body, _) = request_body(Generate {
            system: "rules".into(),
            user: "[r1] exam".into(),
            schema: json!({"type":"object"}),
            max_output_tokens: 4096,
        })
        .unwrap();
        assert_eq!(body["model"], MODEL);
        assert_eq!(body["response_format"]["json_schema"]["strict"], true);
        assert!(body.get("tools").is_none());
        assert!(body.get("images").is_none());
        assert!(request_body(Generate {
            system: "a".repeat(MAX_BYTES),
            user: "b".into(),
            schema: json!({}),
            max_output_tokens: 1
        })
        .is_err());
    }
    #[tokio::test]
    async fn local_mode_rejects_requests_before_network() {
        let dir = tempfile::tempdir().unwrap();
        let service = Groq::new(dir.path().join("usage.json")).unwrap();
        let inner = service.inner.lock().await;
        assert_eq!(check_enabled(&inner).unwrap_err().code, "GROQ_DISABLED");
    }
    #[tokio::test]
    async fn rate_headers_are_authoritative_and_persisted() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("usage.json");
        let service = Groq::new(path.clone()).unwrap();
        let mut headers = HeaderMap::new();
        headers.insert("retry-after", "7".parse().unwrap());
        headers.insert("x-ratelimit-remaining-tokens", "0".parse().unwrap());
        headers.insert("x-ratelimit-reset-tokens", "2m59.56s".parse().unwrap());
        let before = now_ms();
        let at = service.headers(&headers, true, 0).await.unwrap();
        assert!(at >= before + 179560);
        assert_eq!(Config::load(&path).unwrap().cooldown_until, at);
    }
    #[test]
    fn failures_never_include_raw_provider_content() {
        assert_eq!(
            http_error(StatusCode::UNAUTHORIZED).code,
            "GROQ_INVALID_KEY"
        );
        assert_eq!(
            http_error(StatusCode::NOT_FOUND).code,
            "GROQ_MODEL_UNAVAILABLE"
        );
        assert_eq!(
            http_error(StatusCode::BAD_REQUEST).code,
            "GROQ_REQUEST_REJECTED"
        );
    }
}

#[cfg(test)]
mod http_tests;

#[cfg(test)]
mod evaluation;
