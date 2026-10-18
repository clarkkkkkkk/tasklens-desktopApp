mod audio;
mod recording;
use serde_json::{json, Value};
#[cfg(test)]
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

struct Job {
    path: PathBuf,
    cancelled: Arc<AtomicBool>,
    bytes: u64,
    expected: u64,
    extension: Option<String>,
    recording: Option<recording::Recording>,
}
#[derive(Default)]
pub struct VoiceState {
    pub initialization_error: Mutex<Option<String>>,
    jobs: Mutex<HashMap<String, Job>>,
    inference: Mutex<()>,
    model_status: Mutex<HashMap<String, String>>,
}
fn error() -> String {
    "Local processing could not complete. Please try again.".into()
}
fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|_| error())
}
pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    let tmp = root(app)?.join("voice-jobs");
    if tmp.exists() {
        fs::remove_dir_all(&tmp).map_err(|_| "Cannot clean temporary voice files")?;
    }
    fs::create_dir_all(&tmp).map_err(|_| error())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o700)).map_err(|_| error())?;
    }
    fs::create_dir_all(root(app)?.join("models")).map_err(|_| error())?;
    Ok(())
}
fn manifest(kind: &str) -> Result<Value, String> {
    let data: Value =
        serde_json::from_str(include_str!("../../resources/models.json")).map_err(|_| error())?;
    data.get(kind)
        .cloned()
        .ok_or_else(|| "Unknown model".into())
}
fn model(app: &tauri::AppHandle, kind: &str) -> Result<PathBuf, String> {
    crate::assets::model_path(app, kind)
}
fn executable(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    crate::platform::bundled_binary(app, name).ok_or_else(|| {
        "Local runtime missing. Install a TaskLens build that includes the inference runtimes."
            .into()
    })
}
#[cfg(test)]
fn hash(path: &Path, spec: &Value) -> Result<(), String> {
    use std::io::Read;
    let mut file = fs::File::open(path).map_err(|_| "Model file is missing")?;
    if file.metadata().map_err(|_| error())?.len() != spec["bytes"].as_u64().unwrap() {
        return Err("Model size does not match the supported model".into());
    }
    let mut digest = Sha256::new();
    let mut buf = [0u8; 1024 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|_| "Cannot read model")?;
        if n == 0 {
            break;
        }
        digest.update(&buf[..n]);
    }
    if format!("{:x}", digest.finalize()) != spec["sha256"].as_str().unwrap() {
        return Err("Model checksum does not match. Import the supported model again.".into());
    }
    Ok(())
}
fn run(
    app: &tauri::AppHandle,
    name: &str,
    args: &[String],
    folder: &Path,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let out = folder.join("worker-output.txt");
    let file = fs::File::create(&out).map_err(|_| error())?;
    let mut command = crate::platform::command(&executable(app, name)?);
    command.args(args).stdout(file).stderr(Stdio::null());
    let mut child = crate::platform::spawn(&mut command)
        .map_err(|_| "Could not start local inference runtime")?;
    let start = Instant::now();
    loop {
        if cancel.load(Ordering::SeqCst)
            || start.elapsed() > Duration::from_secs(1800)
            || fs::metadata(&out)
                .map(|m| m.len() > 2_000_000)
                .unwrap_or(false)
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Processing cancelled or exceeded the processing limit".into());
        }
        if let Some(status) = child.try_wait().map_err(|_| error())? {
            if !status.success() {
                return Err(
                    "Local inference failed. Validate the model in Settings and retry.".into(),
                );
            }
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    fs::read_to_string(out).map_err(|_| error())
}
fn new_job(app: &tauri::AppHandle, expected: u64) -> Result<(String, PathBuf), String> {
    let state = app.state::<VoiceState>();
    let _gate = state.inference.try_lock().map_err(|_| {
        "Local processing is busy. Wait for model validation to finish before capturing."
    })?;
    if let Some(message) = state.initialization_error.lock().unwrap().clone() {
        return Err(message);
    }
    let mut jobs = state.jobs.lock().unwrap();
    if !jobs.is_empty() {
        return Err("Finish or cancel the current capture first.".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let path = root(app)?.join("voice-jobs").join(&id);
    fs::create_dir(&path).map_err(|_| error())?;
    jobs.insert(
        id.clone(),
        Job {
            path: path.clone(),
            cancelled: Arc::new(AtomicBool::new(false)),
            bytes: 0,
            expected,
            extension: None,
            recording: None,
        },
    );
    Ok((id, path))
}
fn cleanup(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let state = app.state::<VoiceState>();
    let mut jobs = state.jobs.lock().unwrap();
    if let Some(job) = jobs.get(id) {
        match fs::remove_dir_all(&job.path) {
            Ok(()) => {},
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
            Err(_) => return Err("Temporary voice files could not be removed. Retry cancellation or restart TaskLens.".into()),
        }
        jobs.remove(id);
    }
    Ok(())
}
fn job(app: &tauri::AppHandle, id: &str) -> Result<(PathBuf, Arc<AtomicBool>), String> {
    let state = app.state::<VoiceState>();
    let jobs = state.jobs.lock().unwrap();
    let j = jobs.get(id).ok_or("Capture expired")?;
    Ok((j.path.clone(), j.cancelled.clone()))
}
fn check_window(window: &tauri::Window) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Voice is available only in the main window".into())
    }
}

#[tauri::command]
pub async fn voice_models(window: tauri::Window, app: tauri::AppHandle) -> Result<Value, String> {
    check_window(&window)?;
    let state = app.state::<VoiceState>();
    let status = state.model_status.lock().unwrap();
    let mut result = Vec::new();
    // Voice manages only whisper; the extraction model lives in Settings › Local AI.
    let kind = "whisper";
    let spec = manifest(kind)?;
    let path = model(&app, kind)?;
    let prior = if !path.is_file() {
        "not_installed"
    } else if crate::assets::cached(&app, kind, &path, &spec) {
        "ready"
    } else {
        "validating"
    };
    result.push(json!({"kind": kind, "name": spec["model"], "status": status.get(kind).map(String::as_str).unwrap_or(prior), "runtimeAvailable": executable(&app, "whisper-cli").is_ok(), "source": spec["source"]}));
    Ok(json!(result))
}
#[tauri::command]
pub async fn voice_validate_model(
    window: tauri::Window,
    app: tauri::AppHandle,
    kind: String,
    import: bool,
) -> Result<(), String> {
    check_window(&window)?;
    if kind != "whisper" {
        return Err("Manage the extraction model in Settings › Local AI.".into());
    }
    manifest(&kind)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VoiceState>();
        let _gate = state
            .inference
            .try_lock()
            .map_err(|_| "Local processing is busy")?;
        if !state.jobs.lock().unwrap().is_empty() {
            return Err("Finish or cancel the current capture before validating models.".into());
        }
        state
            .model_status
            .lock()
            .unwrap()
            .insert(kind.clone(), "validating".into());
        let result = (|| {
            let runtime = crate::local_ai::server::runtime(&app);
            let _model_gate = runtime.gate.lock().unwrap();
            runtime.stop(&app);
            let cancel = AtomicBool::new(false);
            if import {
                let source = rfd::FileDialog::new()
                    .set_title("Import the supported local model")
                    .pick_file()
                    .ok_or("Model import cancelled")?;
                crate::assets::import(&app, &kind, &source, &cancel)?;
            } else {
                crate::assets::verify_model(&app, &kind, true, &cancel)?;
            }
            let target = model(&app, &kind)?;
            let folder = root(&app)?.join("model-validation");
            fs::create_dir_all(&folder).map_err(|_| error())?;
            let cancel = AtomicBool::new(false);
            let wav = folder.join("silence.wav");
            audio::write_wav(&wav, &vec![0.0; 16000])?;
            let result = run(
                &app,
                "whisper-cli",
                &[
                    "-m".into(),
                    target.to_string_lossy().into(),
                    "-f".into(),
                    wav.to_string_lossy().into(),
                    "-l".into(),
                    "auto".into(),
                ],
                &folder,
                &cancel,
            );
            let _ = fs::remove_dir_all(folder);
            result?;
            Ok(())
        })();
        state
            .model_status
            .lock()
            .unwrap()
            .insert(kind, if result.is_ok() { "ready" } else { "error" }.into());
        result
    })
    .await
    .map_err(|_| error())?
}
#[tauri::command]
pub async fn voice_start(window: tauri::Window, app: tauri::AppHandle) -> Result<String, String> {
    check_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (id, path) = new_job(&app, 0)?;
        match recording::start(app.clone(), id.clone(), path.join("audio.wav")) {
            Ok(r) => {
                app.state::<VoiceState>()
                    .jobs
                    .lock()
                    .unwrap()
                    .get_mut(&id)
                    .unwrap()
                    .recording = Some(r);
                Ok(id)
            }
            Err(e) => {
                cleanup(&app, &id)?;
                Err(e)
            }
        }
    })
    .await
    .map_err(|_| error())?
}
#[tauri::command]
pub async fn voice_stop(
    window: tauri::Window,
    app: tauri::AppHandle,
    id: String,
) -> Result<u64, String> {
    check_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VoiceState>();
        let _gate = state.inference.lock().unwrap();
        let rec = app
            .state::<VoiceState>()
            .jobs
            .lock()
            .unwrap()
            .get_mut(&id)
            .ok_or("Capture expired")?
            .recording
            .take()
            .ok_or("No active recording")?;
        let _ = rec.stop.send(());
        rec.worker.join().map_err(|_| error())?
    })
    .await
    .map_err(|_| error())?
}
#[tauri::command]
pub async fn voice_import_begin(
    window: tauri::Window,
    app: tauri::AppHandle,
    size: u64,
    name: String,
) -> Result<String, String> {
    check_window(&window)?;
    let extension = Path::new(&name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if size == 0 || size > audio::MAX_BYTES {
        return Err("Choose an audio file up to 100 MB".into());
    }
    if !["wav", "mp3", "m4a", "ogg"].contains(&extension.as_str()) {
        return Err("Audio format unsupported".into());
    }
    let (id, _) = new_job(&app, size)?;
    if let Some(job) = app.state::<VoiceState>().jobs.lock().unwrap().get_mut(&id) {
        job.extension = Some(extension);
    }
    Ok(id)
}
#[tauri::command]
pub async fn voice_import_chunk(
    window: tauri::Window,
    app: tauri::AppHandle,
    id: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    check_window(&window)?;
    if bytes.len() > 262144 {
        return Err("Audio transfer chunk too large".into());
    }
    let state = app.state::<VoiceState>();
    let mut jobs = state.jobs.lock().unwrap();
    let job = jobs.get_mut(&id).ok_or("Capture expired")?;
    if job.cancelled.load(Ordering::SeqCst) || job.bytes + bytes.len() as u64 > job.expected {
        return Err("Audio transfer cancelled or exceeds declared size".into());
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(job.path.join("imported.audio"))
        .map_err(|_| error())?;
    file.write_all(&bytes).map_err(|_| error())?;
    job.bytes += bytes.len() as u64;
    Ok(())
}
#[tauri::command]
pub async fn voice_cancel(
    window: tauri::Window,
    app: tauri::AppHandle,
    id: String,
) -> Result<(), String> {
    check_window(&window)?;
    let recording = {
        let state = app.state::<VoiceState>();
        let mut jobs = state.jobs.lock().unwrap();
        if let Some(j) = jobs.get_mut(&id) {
            j.cancelled.store(true, Ordering::SeqCst);
            j.recording.take()
        } else {
            return Ok(());
        }
    };
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(r) = recording {
            let _ = r.stop.send(());
            let _ = r.worker.join();
        }
        let state = app.state::<VoiceState>();
        let _gate = state.inference.lock().unwrap();
        cleanup(&app, &id)
    })
    .await
    .map_err(|_| error())??;
    Ok(())
}
#[tauri::command]
pub async fn voice_transcribe(
    window: tauri::Window,
    app: tauri::AppHandle,
    id: String,
) -> Result<Value, String> {
    check_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VoiceState>();
        let _gate = state
            .inference
            .try_lock()
            .map_err(|_| "Local processing is busy")?;
        let (path, cancel) = job(&app, &id)?;
        let result = (|| {
            let model_path = model(&app, "whisper")?;
            crate::assets::verify_model(&app, "whisper", false, &cancel)?;
            state
                .model_status
                .lock()
                .unwrap()
                .insert("whisper".into(), "loading".into());
            let duration = if path.join("imported.audio").exists() {
                {
                    let jobs = state.jobs.lock().unwrap();
                    let j = jobs.get(&id).ok_or("Capture expired")?;
                    if j.bytes != j.expected {
                        return Err("Audio transfer incomplete".into());
                    }
                    audio::validate_signature(
                        &path.join("imported.audio"),
                        j.extension.as_deref().ok_or("Unknown audio type")?,
                    )?;
                }
                let _ = app.emit(
                    "voice-progress",
                    json!({"jobId":id,"stage":"preprocessing"}),
                );
                audio::convert(
                    &path.join("imported.audio"),
                    &path.join("audio.wav"),
                    || cancel.load(Ordering::SeqCst),
                )?
            } else {
                let reader = hound::WavReader::open(path.join("audio.wav"))
                    .map_err(|_| "Recording could not be read")?;
                reader.duration() as u64 * 1000 / 16000
            };
            audio::check_signal(&path.join("audio.wav"), || cancel.load(Ordering::SeqCst))?;
            // Reject invalid/silent audio before evicting the reusable text model. Only
            // inference needs the shared model gate; preprocessing loads no speech model.
            let runtime = crate::local_ai::server::runtime(&app);
            let _model_gate = runtime.gate.lock().unwrap();
            if cancel.load(Ordering::SeqCst) {
                return Err(crate::platform::CANCELLED.into());
            }
            runtime.stop(&app);
            let _ = app.emit("voice-progress", json!({"jobId":id,"stage":"transcribing"}));
            let prefix = path.join("transcript");
            run(
                &app,
                "whisper-cli",
                &[
                    "-m".into(),
                    model_path.to_string_lossy().into(),
                    "-f".into(),
                    path.join("audio.wav").to_string_lossy().into(),
                    "-l".into(),
                    "auto".into(),
                    "-oj".into(),
                    "-of".into(),
                    prefix.to_string_lossy().into(),
                ],
                &path,
                &cancel,
            )?;
            if fs::metadata(prefix.with_extension("json"))
                .map_err(|_| error())?
                .len()
                > 2_000_000
            {
                return Err("Transcript exceeds the review limit".into());
            }
            let raw: Value = serde_json::from_slice(
                &fs::read(prefix.with_extension("json")).map_err(|_| error())?,
            )
            .map_err(|_| "Invalid transcription output")?;
            parse_transcript(&raw, duration)
        })();
        state.model_status.lock().unwrap().insert(
            "whisper".into(),
            if result.is_ok() { "ready" } else { "error" }.into(),
        );
        cleanup(&app, &id)?;
        result
    })
    .await
    .map_err(|_| error())?
}
fn parse_transcript(raw: &Value, duration: u64) -> Result<Value, String> {
    let segments:Vec<Value>=raw["transcription"].as_array().ok_or("Invalid transcript")?.iter().enumerate().filter_map(|(i,s)|{
        let text=s["text"].as_str()?.trim(); if text.is_empty() || (text.starts_with('[')&&text.ends_with(']')){return None;}
        Some(json!({"id":format!("s{}",i+1),"startMs":s["offsets"]["from"].as_u64().unwrap_or(0).min(duration),"endMs":s["offsets"]["to"].as_u64().unwrap_or(duration).min(duration),"text":text}))
    }).collect();
    let full = segments
        .iter()
        .filter_map(|s| s["text"].as_str())
        .collect::<Vec<_>>()
        .join(" ");
    if full.chars().filter(|c| c.is_alphanumeric()).count() < 3 {
        return Err("No clear speech was detected.".into());
    }
    if full.len() > 100000 || segments.len() > 3000 {
        return Err("Transcript exceeds the review limit".into());
    }
    Ok(
        json!({"fullText":full,"segments":segments,"language":raw["result"]["language"],"durationMs":duration,"model":crate::assets::spec("whisper")["id"]}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pinned_hash_rejects_corrupt_and_wrong_size_models() {
        let file = std::env::temp_dir().join(format!("tasklens-hash-{}", uuid::Uuid::new_v4()));
        let spec = json!({"bytes":4,"sha256":"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"});
        fs::write(&file, b"test").unwrap();
        assert!(hash(&file, &spec).is_ok());
        fs::write(&file, b"tast").unwrap();
        assert!(hash(&file, &spec).unwrap_err().contains("checksum"));
        fs::write(&file, b"short").unwrap();
        assert!(hash(&file, &spec).unwrap_err().contains("size"));
        fs::remove_file(file).unwrap();
    }
    #[test]
    fn rejects_silence() {
        assert!(parse_transcript(&json!({"transcription":[]}), 1000).is_err());
    }
    #[test]
    fn timestamps_and_text() {
        let value=parse_transcript(&json!({"transcription":[{"offsets":{"from":100,"to":500},"text":" Hello there "}],"result":{"language":"en"}}),1000).unwrap();
        assert_eq!(value["segments"][0]["startMs"], 100);
        assert_eq!(value["fullText"], "Hello there");
    }
}
