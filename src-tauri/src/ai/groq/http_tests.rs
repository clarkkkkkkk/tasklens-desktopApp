//! Loopback mocks only. Production endpoints cannot be overridden outside cfg(test).
use super::*;
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::Mutex as StdMutex,
};

struct MockReply {
    status: u16,
    headers: &'static str,
    body: String,
    delay_ms: u64,
}
fn reply(status: u16, body: &str) -> MockReply {
    MockReply {
        status,
        headers: "",
        body: body.into(),
        delay_ms: 0,
    }
}
fn mock(replies: Vec<MockReply>) -> (String, Arc<StdMutex<Vec<String>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let received = Arc::new(StdMutex::new(Vec::new()));
    let captured = received.clone();
    std::thread::spawn(move || {
        for response in replies {
            let Ok((mut socket, _)) = listener.accept() else {
                return;
            };
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0u8; 4096];
            loop {
                let Ok(count) = socket.read(&mut buffer) else {
                    return;
                };
                if count == 0 {
                    return;
                }
                bytes.extend_from_slice(&buffer[..count]);
                if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                    let length: usize = header
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length: "))
                        .and_then(|n| n.parse().ok())
                        .unwrap_or(0);
                    if bytes.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            captured
                .lock()
                .unwrap()
                .push(String::from_utf8_lossy(&bytes).into_owned());
            std::thread::sleep(Duration::from_millis(response.delay_ms));
            let head = format!("HTTP/1.1 {} Mock\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{}\r\n", response.status, response.body.len(), response.headers);
            let _ = socket.write_all(head.as_bytes());
            let _ = socket.write_all(response.body.as_bytes());
        }
    });
    (base, received)
}
fn request() -> Generate {
    Generate {
        system: "Extract tasks with evidence".into(),
        user: "[t1] Exam October 30 at 9AM".into(),
        schema: json!({"type":"object","properties":{},"required":[],"additionalProperties":false}),
        max_output_tokens: 4096,
    }
}
fn success() -> String {
    json!({"choices":[{"message":{"content":"{\"items\":[],\"ambiguities\":[]}"},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":10}}).to_string()
}
async fn service(base: String, timeout_ms: u64) -> (Arc<Groq>, tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let mut service = Groq::new(dir.path().join("groq-usage.json")).unwrap();
    service.test_base = Some(base);
    service.client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .unwrap();
    {
        let inner = service.inner.get_mut();
        inner.enabled = true;
        inner.loaded = true;
        inner.key = Some(Zeroizing::new("synthetic-test-key".into()));
        inner.config.consent_version = CONSENT_VERSION;
    }
    let service = Arc::new(service);
    let id = uuid::Uuid::new_v4().to_string();
    service
        .begin(id.clone(), "source one".into(), |_, _| {})
        .await
        .unwrap();
    (service, dir, id)
}
#[tokio::test]
async fn native_request_authenticates_and_parses_usage_without_returning_credentials() {
    let (base, captured) = mock(vec![reply(200, &success())]);
    let (service, _dir, id) = service(base, 1000).await;
    let generated = service.generate(&id, request(), |_, _| {}).await.unwrap();
    assert_eq!(generated.input_tokens, Some(20));
    assert_eq!(generated.output_tokens, Some(10));
    let serialized = serde_json::to_string(&generated).unwrap();
    assert!(!serialized.contains("synthetic-test-key"));
    let received = captured.lock().unwrap();
    assert!(received[0].starts_with("POST /chat/completions "));
    assert!(received[0].contains("authorization: Bearer synthetic-test-key"));
    assert!(received[0].contains("openai/gpt-oss-20b"));
    assert_eq!(service.inner.lock().await.config.daily, 1);
}
#[tokio::test]
async fn invalid_keys_do_not_expose_remote_error_bodies_or_retry() {
    let (base, captured) = mock(vec![reply(401, "secret-provider-error-body")]);
    let (service, _dir, id) = service(base, 1000).await;
    let error = service
        .generate(&id, request(), |_, _| {})
        .await
        .err()
        .unwrap();
    assert_eq!(error.code, "GROQ_INVALID_KEY");
    assert!(!error.message.contains("secret-provider"));
    assert_eq!(captured.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn redirects_are_not_followed_and_malformed_responses_fail() {
    for response in [
        MockReply {
            headers: "Location: http://127.0.0.1:9/steal\r\n",
            ..reply(302, "")
        },
        reply(200, "not json"),
        reply(200, &json!({"choices":[]}).to_string()),
    ] {
        let (base, captured) = mock(vec![response]);
        let (service, _dir, id) = service(base, 1000).await;
        assert!(service.generate(&id, request(), |_, _| {}).await.is_err());
        assert_eq!(captured.lock().unwrap().len(), 1);
    }
}
#[tokio::test]
async fn timeout_and_cancellation_drop_the_request_and_never_return_late_results() {
    let (base, _) = mock(vec![MockReply {
        delay_ms: 200,
        ..reply(200, &success())
    }]);
    let (service, _dir, id) = service(base, 40).await;
    assert_eq!(
        service
            .generate(&id, request(), |_, _| {})
            .await
            .err()
            .unwrap()
            .code,
        "GROQ_TIMEOUT"
    );
    let (base, _) = mock(vec![MockReply {
        delay_ms: 200,
        ..reply(200, &success())
    }]);
    let (service, _dir, id) = self::service(base, 1000).await;
    let runner = service.clone();
    let running_id = id.clone();
    let task =
        tokio::spawn(async move { runner.generate(&running_id, request(), |_, _| {}).await });
    tokio::time::sleep(Duration::from_millis(30)).await;
    service.finish(&id).await;
    assert_eq!(task.await.unwrap().err().unwrap().code, "CANCELLED");
    service.finish(&id).await;
    assert!(service.inner.lock().await.sessions.is_empty());
}
#[tokio::test]
async fn retries_429_once_then_accepts_success_and_counts_both_attempts() {
    let (base, captured) = mock(vec![
        MockReply {
            headers: "Retry-After: 0\r\n",
            ..reply(429, "do not expose")
        },
        reply(200, &success()),
    ]);
    let (service, _dir, id) = service(base, 1000).await;
    service.generate(&id, request(), |_, _| {}).await.unwrap();
    assert_eq!(captured.lock().unwrap().len(), 2);
    assert_eq!(service.inner.lock().await.config.daily, 2);
}
#[tokio::test]
async fn long_provider_reset_returns_retry_time_without_repeated_repairs() {
    let (base, captured) = mock(vec![MockReply {
        headers: "Retry-After: 180\r\n",
        ..reply(429, "")
    }]);
    let (service, _dir, id) = service(base, 1000).await;
    let error = service
        .generate(&id, request(), |_, _| {})
        .await
        .err()
        .unwrap();
    assert_eq!(error.code, "GROQ_RATE_LIMIT");
    assert!(error.retry_at.unwrap() > now_ms() + 120_000);
    assert_eq!(captured.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn exhausted_known_tokens_prevent_a_second_transmission() {
    let (base, captured) = mock(vec![MockReply {
        headers: "x-ratelimit-remaining-tokens: 0\r\nx-ratelimit-reset-tokens: 3m\r\n",
        ..reply(200, &success())
    }]);
    let (service, _dir, id) = service(base, 1000).await;
    let result = service.generate(&id, request(), |_, _| {}).await.unwrap();
    assert!(!result.can_repair);
    assert_eq!(
        service
            .generate(&id, request(), |_, _| {})
            .await
            .err()
            .unwrap()
            .code,
        "GROQ_RATE_LIMIT"
    );
    assert_eq!(captured.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn fifo_queue_caps_duplicates_and_cancel_before_admission() {
    let (service, _dir, first) = service("http://127.0.0.1:9".into(), 1000).await;
    let duplicate = uuid::Uuid::new_v4().to_string();
    assert_eq!(
        service
            .begin(duplicate, "source one".into(), |_, _| {})
            .await
            .err()
            .unwrap()
            .code,
        "GROQ_DUPLICATE"
    );
    let mut tasks = Vec::new();
    let mut ids = Vec::new();
    for n in 0..2 {
        let id = uuid::Uuid::new_v4().to_string();
        ids.push(id.clone());
        let runner = service.clone();
        tasks.push(tokio::spawn(async move {
            runner.begin(id, format!("source {n}"), |_, _| {}).await
        }));
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!(
        service
            .begin(
                uuid::Uuid::new_v4().to_string(),
                "overflow".into(),
                |_, _| {}
            )
            .await
            .err()
            .unwrap()
            .code,
        "GROQ_QUEUE_FULL"
    );
    service.finish(&ids[1]).await;
    assert_eq!(
        tasks.pop().unwrap().await.unwrap().err().unwrap().code,
        "CANCELLED"
    );
    service.finish(&first).await;
    tasks.pop().unwrap().await.unwrap().unwrap();
    service.finish(&ids[0]).await;
    let early = uuid::Uuid::new_v4().to_string();
    service.finish(&early).await;
    assert_eq!(
        service
            .begin(early, "early cancel".into(), |_, _| {})
            .await
            .err()
            .unwrap()
            .code,
        "CANCELLED"
    );
    assert_eq!(service.inner.lock().await.config.daily, 0);
}

struct MemoryCredentials {
    value: StdMutex<Option<String>>,
    unavailable: AtomicBool,
}
impl credentials::Store for MemoryCredentials {
    fn read(&self) -> std::result::Result<Zeroizing<String>, CredentialFailure> {
        if self.unavailable.load(Ordering::SeqCst) {
            return Err(CredentialFailure::Unavailable);
        }
        self.value
            .lock()
            .unwrap()
            .clone()
            .map(Zeroizing::new)
            .ok_or(CredentialFailure::Missing)
    }
    fn write(&self, key: &str) -> std::result::Result<(), CredentialFailure> {
        if self.unavailable.load(Ordering::SeqCst) {
            return Err(CredentialFailure::Unavailable);
        }
        *self.value.lock().unwrap() = Some(key.into());
        Ok(())
    }
    fn remove(&self) -> std::result::Result<(), CredentialFailure> {
        if self.unavailable.load(Ordering::SeqCst) {
            return Err(CredentialFailure::Unavailable);
        }
        *self.value.lock().unwrap() = None;
        Ok(())
    }
}
#[tokio::test]
async fn secure_persistence_session_fallback_and_failed_removal_are_safe_across_restarts() {
    let store = Arc::new(MemoryCredentials {
        value: StdMutex::new(None),
        unavailable: AtomicBool::new(false),
    });
    let (base, _) = mock(vec![reply(
        200,
        &json!({"data":[{"id":MODEL}]}).to_string(),
    )]);
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("groq-usage.json");
    let mut service = Groq::new(path.clone()).unwrap();
    service.credentials = store.clone();
    service.test_base = Some(base);
    service.client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let status = service
        .connect_key("synthetic-test-key".into())
        .await
        .unwrap();
    assert!(status.connected);
    assert_eq!(status.storage, "persistent");
    assert!(!status.consent);
    assert!(!status.enabled);
    assert!(!std::fs::read_to_string(&path)
        .unwrap()
        .contains("synthetic-test-key"));
    let mut restarted = Groq::new(path.clone()).unwrap();
    restarted.credentials = store.clone();
    assert!(restarted.status().await.connected);
    // An unavailable/locked backend cannot be silently replaced by a plaintext file.
    store.unavailable.store(true, Ordering::SeqCst);
    let status = restarted.disconnect_key().await.unwrap();
    assert!(!status.connected);
    assert!(status.removal_incomplete);
    let mut restarted = Groq::new(path.clone()).unwrap();
    restarted.credentials = store.clone();
    assert!(!restarted.status().await.connected);
    let (base, _) = mock(vec![reply(
        200,
        &json!({"data":[{"id":MODEL}]}).to_string(),
    )]);
    restarted.test_base = Some(base);
    restarted.client = Client::builder().build().unwrap();
    let status = restarted
        .connect_key("new-synthetic-test-key".into())
        .await
        .unwrap();
    assert!(status.connected);
    assert_eq!(status.storage, "session");
    let mut restarted = Groq::new(path.clone()).unwrap();
    restarted.credentials = store.clone();
    assert!(!restarted.status().await.connected);
    store.unavailable.store(false, Ordering::SeqCst);
    let status = restarted.disconnect_key().await.unwrap();
    assert!(!status.removal_incomplete);
    assert!(store.value.lock().unwrap().is_none());
}
#[tokio::test]
async fn invalid_candidate_does_not_replace_a_connected_key() {
    let (base, _) = mock(vec![reply(401, "not exposed")]);
    let (service, _dir, _) = service(base, 1000).await;
    assert_eq!(
        service
            .connect_key("invalid-test-key".into())
            .await
            .err()
            .unwrap()
            .code,
        "GROQ_INVALID_KEY"
    );
    assert_eq!(
        service.inner.lock().await.key.as_ref().unwrap().as_str(),
        "synthetic-test-key"
    );
}

#[tokio::test]
async fn third_429_stops_without_a_fourth_attempt_and_backoff_obeys_both_resets() {
    let (base, captured) = mock(vec![reply(429, ""), reply(429, ""), reply(429, "")]);
    let (mut service, _dir, id) = service(base, 1000).await;
    let initial = now_ms();
    let clock = Arc::new(std::sync::atomic::AtomicI64::new(initial));
    Arc::get_mut(&mut service).unwrap().test_clock = Some(clock.clone());
    let error = service
        .generate(&id, request(), |stage, at| {
            if stage == "waiting" {
                if let Some(at) = at {
                    clock.store(at, Ordering::SeqCst);
                }
            }
        })
        .await
        .err()
        .unwrap();
    assert_eq!(error.code, "GROQ_RATE_LIMIT");
    assert_eq!(captured.lock().unwrap().len(), 3);
    assert_eq!(service.inner.lock().await.config.daily, 3);
    assert!(clock.load(Ordering::SeqCst) >= initial + 60_000);
}

#[tokio::test]
async fn disconnect_attempts_secure_removal_even_when_local_configuration_cannot_be_written() {
    let store = Arc::new(MemoryCredentials {
        value: StdMutex::new(Some("synthetic-test-key".into())),
        unavailable: AtomicBool::new(false),
    });
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("usage.json");
    let mut service = Groq::new(path.clone()).unwrap();
    service.credentials = store.clone();
    std::fs::create_dir(&path).unwrap(); // atomic replacement must fail
    let error = service.disconnect_key().await.err().unwrap();
    assert_eq!(error.code, "GROQ_STORAGE");
    assert!(store.value.lock().unwrap().is_none());
    let inner = service.inner.lock().await;
    assert!(!inner.enabled);
    assert!(inner.key.is_none());
}

#[tokio::test]
async fn a_successful_provider_response_cannot_echo_the_api_key_back_to_the_webview() {
    let body =
        json!({"choices":[{"message":{"content":"synthetic-test-key"},"finish_reason":"stop"}]})
            .to_string();
    let (base, _) = mock(vec![reply(200, &body)]);
    let (service, _dir, id) = service(base, 1000).await;
    let error = service
        .generate(&id, request(), |_, _| {})
        .await
        .err()
        .unwrap();
    assert_eq!(error.code, "GROQ_INVALID_OUTPUT");
    assert!(!error.message.contains("synthetic-test-key"));
}
