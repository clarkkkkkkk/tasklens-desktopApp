//! Opt-in metadata only. Never accepts source text, arguments, stderr or authentication keys.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    sync::{Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    pub code: String,
    pub detail_code: String,
    pub stage: String,
    pub message: String,
}
impl Failure {
    pub fn wire(code: &str, detail: &str, stage: &str, message: &str) -> String {
        serde_json::to_string(&Self {
            code: code.into(),
            detail_code: detail.into(),
            stage: stage.into(),
            message: message.into(),
        })
        .unwrap()
    }
}
pub fn transport(error: &std::io::Error) -> &'static str {
    use std::io::ErrorKind::*;
    if error.to_string() == crate::local_ai::http::CANCELLED_IO {
        return "CANCELLED";
    }
    match error.kind() {
        TimedOut | WouldBlock => "TIMEOUT",
        ConnectionRefused => "CONNECTION_REFUSED",
        ConnectionReset | ConnectionAborted | BrokenPipe => "CONNECTION_RESET",
        UnexpectedEof => "UNEXPECTED_EOF",
        InvalidData => "INVALID_RESPONSE",
        _ => "TRANSPORT_FAILED",
    }
}

#[derive(Default)]
struct Recorder {
    enabled: bool,
    events: VecDeque<Value>,
}
fn recorder() -> &'static Mutex<Recorder> {
    static STATE: OnceLock<Mutex<Recorder>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(Recorder::default()))
}
pub fn set_recording(value: bool) {
    let mut state = recorder().lock().unwrap();
    state.enabled = value;
    state.events.clear();
}
#[cfg(test)]
pub fn events() -> Vec<Value> {
    recorder().lock().unwrap().events.iter().cloned().collect()
}
pub fn enabled() -> bool {
    recorder().lock().unwrap().enabled
}
fn append(value: Value) {
    let mut state = recorder().lock().unwrap();
    if !state.enabled {
        return;
    }
    if state.events.len() == 512 {
        // Long inference must not evict the OCR/transport stage evidence with RAM samples.
        if let Some(index) = state
            .events
            .iter()
            .position(|event| event["event"] == "sample")
        {
            state.events.remove(index);
        } else {
            state.events.pop_front();
        }
    }
    state.events.push_back(value);
}
pub fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
pub fn sample(pid: u32) -> Value {
    #[cfg(target_os = "linux")]
    {
        let status = std::fs::read_to_string(format!("/proc/{pid}/status")).unwrap_or_default();
        let kib = |key: &str| {
            status
                .lines()
                .find(|l| l.starts_with(key))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|n| n.parse::<u64>().ok())
        };
        // Raw process CPU ticks and monotonic sample time permit utilization calculation.
        let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).unwrap_or_default();
        let fields: Vec<_> = stat
            .rsplit_once(')')
            .map(|(_, s)| s.split_whitespace().collect())
            .unwrap_or_default();
        let ticks = |i| {
            fields
                .get(i)
                .and_then(|v: &&str| v.parse::<u64>().ok())
                .unwrap_or(0)
        };
        return json!({"rssKiB":kib("VmRSS:"),"peakRssKiB":kib("VmHWM:"),"cpuTicks":ticks(11)+ticks(12),"ticksPerSecond":unsafe {libc::sysconf(libc::_SC_CLK_TCK)}});
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::{CloseHandle, FILETIME},
            System::{
                ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
                Threading::{
                    GetProcessTimes, OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
                },
            },
        };
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
            if handle.is_null() {
                return json!({"available":false});
            }
            let mut counters: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
            counters.cb = std::mem::size_of_val(&counters) as u32;
            let memory = K32GetProcessMemoryInfo(
                handle,
                &mut counters,
                std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
            ) != 0;
            let (mut created, mut exited, mut kernel, mut user): (
                FILETIME,
                FILETIME,
                FILETIME,
                FILETIME,
            ) = (
                std::mem::zeroed(),
                std::mem::zeroed(),
                std::mem::zeroed(),
                std::mem::zeroed(),
            );
            let cpu =
                GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) != 0;
            CloseHandle(handle);
            let ticks = |t: FILETIME| ((t.dwHighDateTime as u64) << 32) | t.dwLowDateTime as u64;
            return json!({"rssKiB":memory.then_some(counters.WorkingSetSize/1024),"peakRssKiB":memory.then_some(counters.PeakWorkingSetSize/1024),"cpuTicks":cpu.then_some(ticks(kernel)+ticks(user)),"ticksPerSecond":10_000_000});
        }
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    {
        let _ = pid;
        json!({"available":false})
    }
}
pub fn process_sample(stage: &str, trace: Option<&str>, job: Option<&str>, pid: u32) {
    if enabled() {
        append(
            json!({"stage":stage,"traceId":trace,"jobId":job,"event":"sample","pid":pid,"timestampMs":now_ms(),"memory":sample(pid)}),
        );
    }
}
pub fn model_timings(trace: Option<&str>, job: &str, timings: &Value) {
    if !enabled() {
        return;
    }
    let mut safe = serde_json::Map::new();
    for key in [
        "prompt_n",
        "predicted_n",
        "cache_n",
        "prompt_ms",
        "predicted_ms",
        "prompt_per_second",
        "predicted_per_second",
    ] {
        if timings[key].is_number() {
            safe.insert(key.into(), timings[key].clone());
        }
    }
    append(
        json!({"traceId":trace,"jobId":job,"stage":"inference","event":"timings","provider":"llama-cpp","timestampMs":now_ms(),"timings":safe}),
    );
}
pub struct Span {
    stage: &'static str,
    trace: Option<String>,
    job: Option<String>,
    start: Instant,
    timestamp: u128,
    runtime: Option<&'static str>,
}
impl Span {
    pub fn new(stage: &'static str, trace: Option<&str>, job: Option<&str>) -> Self {
        let valid = |s: Option<&str>| {
            s.filter(|s| uuid::Uuid::parse_str(s).is_ok())
                .map(str::to_owned)
        };
        let span = Self {
            stage,
            trace: valid(trace),
            job: valid(job),
            start: Instant::now(),
            timestamp: now_ms(),
            runtime: match stage {
                "inference" | "prefix_prepare" => Some("llama-server"),
                "reading_text" => Some("tesseract"),
                _ => None,
            },
        };
        if enabled() {
            append(
                json!({"stage":stage,"traceId":span.trace,"jobId":span.job,"event":"start","timestampMs":span.timestamp}),
            );
        }
        span
    }
    pub fn runtime(mut self, runtime: &'static str) -> Self {
        self.runtime = Some(runtime);
        self
    }
    pub fn finish(
        self,
        outcome: &str,
        pid: Option<u32>,
        status: Option<std::process::ExitStatus>,
        categories: &[&str],
    ) {
        if !enabled() {
            return;
        }
        #[cfg(unix)]
        let signal = {
            use std::os::unix::process::ExitStatusExt;
            status.and_then(|s| s.signal())
        };
        #[cfg(not(unix))]
        let signal: Option<i32> = None;
        append(
            json!({"stage":self.stage,"traceId":self.trace,"jobId":self.job,"event":"end","startedAtMs":self.timestamp,"timestampMs":now_ms(),"durationMs":self.start.elapsed().as_millis(),"outcome":outcome,"runtime":self.runtime,"pid":pid,"exitCode":status.and_then(|s| s.code()),"exitCodeHex":status.and_then(|s| s.code()).map(|c| format!("0x{:08X}",c as u32)),"signal":signal,"stderrCategories":categories,"memory":pid.map(sample)}),
        );
    }
}

/// A strict allowlist: unrecognized stderr is drained and discarded, never exported.
pub fn stderr_category(line: &str) -> Option<&'static str> {
    let lower = line.to_ascii_lowercase();
    if lower.contains("error opening data file") {
        Some("LANGUAGE_FILE_UNREADABLE")
    } else if lower.contains("failed loading language") {
        Some("LANGUAGE_LOAD_FAILED")
    } else if lower.contains("not enough memory")
        || lower.contains("bad_alloc")
        || lower.contains("failed to allocate")
    {
        Some("ALLOCATION_FAILED")
    } else if lower.contains("image file cannot be read")
        || (lower.contains("error") && lower.contains("pixread"))
    {
        Some("IMAGE_READ_FAILED")
    } else if lower.contains("dll") && lower.contains("not found") {
        Some("DLL_NOT_FOUND")
    } else {
        None
    }
}
pub fn stderr_reader(
    reader: impl std::io::Read + Send + 'static,
) -> std::thread::JoinHandle<Vec<&'static str>> {
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buffer = [0u8; 2048];
        let mut line = Vec::new();
        let mut categories = Vec::new();
        while let Ok(n) = reader.read(&mut buffer) {
            if n == 0 {
                break;
            }
            for byte in &buffer[..n] {
                if *byte == b'\n' {
                    if let Some(category) = stderr_category(&String::from_utf8_lossy(&line)) {
                        if !categories.contains(&category) {
                            categories.push(category);
                        }
                    }
                    line.clear();
                } else if line.len() < 2048 {
                    line.push(*byte);
                }
            }
        }
        if let Some(c) = stderr_category(&String::from_utf8_lossy(&line)) {
            if !categories.contains(&c) {
                categories.push(c);
            }
        }
        categories
    })
}

#[tauri::command]
pub fn local_diagnostics_session(
    window: tauri::Window,
    enabled: Option<bool>,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err(crate::platform::GENERIC_ERROR.into());
    }
    if let Some(value) = enabled {
        set_recording(value);
    }
    let state = recorder().lock().unwrap();
    Ok(
        json!({"enabled":state.enabled,"events":state.events,"capacity":512,"build":{"processId":std::process::id(),"commit":env!("TASKLENS_BUILD_COMMIT"),"dirty":env!("TASKLENS_BUILD_DIRTY"),"target":env!("TASKLENS_TARGET_TRIPLE"),"debug":cfg!(debug_assertions),"gpuOffload":false,"identifier":app.config().identifier},"runtimeReceipt":serde_json::from_str::<Value>(include_str!("../resources/notices/runtime-build.json")).ok()}),
    )
}
#[tauri::command]
pub fn local_diagnostics_stage(
    window: tauri::Window,
    trace_id: String,
    stage: String,
    event: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err(crate::platform::GENERIC_ERROR.into());
    }
    crate::jobs::valid_id(&trace_id)?;
    if ![
        "selection",
        "preparing_image",
        "reading_text",
        "routing",
        "readiness",
        "inference",
        "validation",
        "review",
    ]
    .contains(&stage.as_str())
        || !["start", "end", "failed", "cancelled"].contains(&event.as_str())
    {
        return Err(crate::platform::GENERIC_ERROR.into());
    }
    append(json!({"traceId":trace_id,"stage":stage,"event":event,"timestampMs":now_ms()}));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recorder_is_bounded_and_disabling_clears_events() {
        assert!(!Recorder::default().enabled);
        set_recording(true);
        append(json!({"stage":"reading_text","event":"end","testMarker":true}));
        for _ in 0..600 {
            append(json!({"stage":"inference","event":"sample"}));
        }
        assert_eq!(events().len(), 512);
        assert!(events().iter().any(|event| event["testMarker"] == true));
        set_recording(false);
        assert!(events().is_empty());
    }
    #[test]
    fn stderr_never_contains_content() {
        let result=stderr_reader(std::io::Cursor::new(b"secret transcript /home/person key=private\nError opening data file /private/secret.traineddata\n".to_vec())).join().unwrap();
        assert_eq!(result, vec!["LANGUAGE_FILE_UNREADABLE"]);
        assert!(!serde_json::to_string(&result).unwrap().contains("secret"));
    }
    #[test]
    fn wire_retains_detail_without_raw_errors() {
        let value: Failure = serde_json::from_str(&Failure::wire(
            "MODEL_FAILED",
            "CONNECTION_RESET",
            "inference",
            "The local model did not respond.",
        ))
        .unwrap();
        assert_eq!(value.detail_code, "CONNECTION_RESET");
    }
}

#[tauri::command]
pub async fn local_diagnostics_identity(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err(crate::platform::GENERIC_ERROR.into());
    }
    tauri::async_runtime::spawn_blocking(move|| {
        use std::io::Read;use sha2::{Digest,Sha256};
        fn hash(path: &std::path::Path)->Option<String>{let mut file=std::fs::File::open(path).ok()?;let mut hash=Sha256::new();let mut buffer=[0u8;256*1024];loop {let n=file.read(&mut buffer).ok()?;if n==0 {break;}hash.update(&buffer[..n]);}Some(format!("{:x}",hash.finalize()))}
        let exe=std::env::current_exe().ok();
        let mut runtimes=serde_json::Map::new();
        for name in ["llama-server","whisper-cli","tesseract"] {
            let path=crate::platform::bundled_binary(&app,name);
            let location=if path.as_ref().is_some_and(|p|exe.as_ref().and_then(|e|e.parent()).is_some_and(|dir|p.starts_with(dir))){"installed_sidecar"}else{"debug_repository"};
            runtimes.insert(name.into(),json!({"available":path.is_some(),"sha256":path.as_deref().and_then(hash),"resourceCategory":location,"avx2":path.as_ref().is_some_and(|p|p.file_name().unwrap_or_default().to_string_lossy().contains("avx2"))}));
        }
        json!({"applicationSha256":exe.as_deref().and_then(hash),"runtimes":runtimes,"manifest":serde_json::from_str::<Value>(include_str!("../resources/models.json")).unwrap()})
    }).await.map_err(|_|crate::platform::GENERIC_ERROR.into())
}
