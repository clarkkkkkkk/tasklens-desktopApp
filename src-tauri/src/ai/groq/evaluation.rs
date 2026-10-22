//! Explicit opt-in bridge for synthetic evaluation. Secrets are read only by Rust.
use super::*;

#[tokio::test]
#[ignore = "requires explicit TASKLENS_GROQ_LIVE=1 and a test key; never run in ordinary CI"]
async fn live_groq_evaluation_request() {
    assert_eq!(
        std::env::var("TASKLENS_GROQ_LIVE").as_deref(),
        Ok("1"),
        "Live Groq evaluation must be explicitly enabled"
    );
    let input =
        std::env::var_os("TASKLENS_GROQ_EVAL_INPUT").expect("synthetic request path required");
    let output = std::env::var_os("TASKLENS_GROQ_EVAL_OUTPUT").expect("result path required");
    let usage = std::env::var_os("TASKLENS_GROQ_EVAL_USAGE")
        .expect("persistent evaluation usage path required");
    let key = Zeroizing::new(
        std::env::var("TASKLENS_GROQ_TEST_KEY")
            .expect("configure a test key in the Rust process environment"),
    );
    let service = Groq::new(PathBuf::from(usage)).unwrap();
    {
        let mut inner = service.inner.lock().await;
        inner.loaded = true;
        inner.key = Some(key);
        inner.storage = "session";
        inner.enabled = true;
        inner.config.consent_version = CONSENT_VERSION;
    }
    let request: Generate = serde_json::from_slice(&std::fs::read(input).unwrap()).unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let fingerprint = request.user.clone();
    let result = match service.begin(id.clone(), fingerprint, |_, _| {}).await {
        Ok(()) => service.generate(&id, request, |_, _| {}).await,
        Err(error) => Err(error),
    };
    service.finish(&id).await;
    let json = match result {
        Ok(response) => json!({"ok":true,"response":response}),
        Err(error) => json!({"ok":false,"error":error}),
    };
    // Synthetic source/output only, no headers or credentials.
    std::fs::write(output, serde_json::to_vec(&json).unwrap()).unwrap();
}
