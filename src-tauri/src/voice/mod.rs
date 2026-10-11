mod audio;
mod recording;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
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
    recording: Option<recording::Recording>,
}
#[derive(Default)]
pub struct VoiceState {
    jobs: Mutex<HashMap<String, Job>>,
    inference: Mutex<()>,
    cancelled_ids: Mutex<HashSet<String>>,
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
    Ok(root(app)?
        .join("models")
        .join(manifest(kind)?["file"].as_str().unwrap()))
}
fn executable(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let name = format!("{}{}", name, if cfg!(windows) { ".exe" } else { "" });
    let path = app
        .path()
        .resource_dir()
        .map_err(|_| error())?
        .join("resources/bin")
        .join(&name);
    if path.is_file() {
        return Ok(path);
    }
    #[cfg(debug_assertions)]
    {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/bin")
            .join(&name);
        if path.is_file() {
            return Ok(path);
        }
    }
    Err(
        "Local runtime missing. Install a TaskLens build that includes the inference runtimes."
            .into(),
    )
}
fn hash(path: &Path, spec: &Value) -> Result<(), String> {
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
    let mut command = Command::new(executable(app, name)?);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(file)
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
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
            recording: None,
        },
    );
    Ok((id, path))
}
fn cleanup(app: &tauri::AppHandle, id: &str) {
    if let Some(job) = app.state::<VoiceState>().jobs.lock().unwrap().remove(id) {
        let _ = fs::remove_dir_all(job.path);
    }
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
    for kind in ["whisper", "extraction"] {
        let spec = manifest(kind)?;
        result.push(json!({"kind":kind,"name":spec["model"],"status":status.get(kind).cloned().unwrap_or_else(|| if model(&app,kind).map(|p| p.exists()).unwrap_or(false) {"validating".into()} else {"not_installed".into()}),"runtimeAvailable":executable(&app,if kind=="whisper" {"whisper-cli"} else {"llama-completion"}).is_ok(),"source":spec["source"]}));
    }
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
    manifest(&kind)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VoiceState>();
        let _gate = state
            .inference
            .try_lock()
            .map_err(|_| "Local processing is busy")?;
        state
            .model_status
            .lock()
            .unwrap()
            .insert(kind.clone(), "validating".into());
        let result = (|| {
            let target = model(&app, &kind)?;
            if import {
                let source = rfd::FileDialog::new()
                    .set_title("Import the supported local model")
                    .pick_file()
                    .ok_or("Model import cancelled")?;
                if fs::metadata(&source)
                    .map_err(|_| "Cannot read model")?
                    .len()
                    != manifest(&kind)?["bytes"].as_u64().unwrap()
                {
                    return Err("Model size does not match the supported model".into());
                }
                let staged = target.with_extension("partial");
                let operation = (|| {
                    fs::copy(&source, &staged).map_err(|_| "Could not copy model")?;
                    hash(&staged, &manifest(&kind)?)?;
                    fs::rename(&staged, &target).map_err(|_| "Could not install model")?;
                    Ok::<(), String>(())
                })();
                let _ = fs::remove_file(staged);
                operation?;
            } else {
                hash(&target, &manifest(&kind)?)?;
            }
            let folder = root(&app)?.join("model-validation");
            fs::create_dir_all(&folder).map_err(|_| error())?;
            let cancel = AtomicBool::new(false);
            let result = if kind == "whisper" {
                let wav = folder.join("silence.wav");
                audio::write_wav(&wav, &vec![0.0; 16000])?;
                run(
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
                )
            } else {
                run(
                    &app,
                    "llama-completion",
                    &[
                        "-m".into(),
                        target.to_string_lossy().into(),
                        "-p".into(),
                        "test".into(),
                        "-n".into(),
                        "0".into(),
                        "-c".into(),
                        "512".into(),
                        "-ngl".into(),
                        "0".into(),
                    ],
                    &folder,
                    &cancel,
                )
            };
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
                cleanup(&app, &id);
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
    Ok(new_job(&app, size)?.0)
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
            let mut cancelled = state.cancelled_ids.lock().unwrap();
            if cancelled.len() < 64 {
                cancelled.insert(id.clone());
            }
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
        cleanup(&app, &id);
    })
    .await
    .map_err(|_| error())?;
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
            let spec = manifest("whisper")?;
            let model_path = model(&app, "whisper")?;
            hash(&model_path, &spec)?;
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
        cleanup(&app, &id);
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
        json!({"fullText":full,"segments":segments,"language":raw["result"]["language"],"durationMs":duration,"model":"whisper-small"}),
    )
}
#[tauri::command]
pub async fn local_extract(
    window: tauri::Window,
    app: tauri::AppHandle,
    id: String,
    prompt: String,
    schema: String,
) -> Result<String, String> {
    check_window(&window)?;
    // The client-provided id is an opaque lookup key only; never a filesystem path.
    if uuid::Uuid::parse_str(&id).is_err() || prompt.len() > 120000 || schema.len() > 50000 {
        return Err("Extraction input exceeds its limit".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VoiceState>();
        let _gate = state
            .inference
            .try_lock()
            .map_err(|_| "Local processing is busy")?;
        if state.cancelled_ids.lock().unwrap().remove(&id) {
            return Err("Processing cancelled".into());
        }
        let (job_id, path) = new_job(&app, 0)?;
        {
            let mut jobs = state.jobs.lock().unwrap();
            let entry = jobs.remove(&job_id).unwrap();
            jobs.insert(id.clone(), entry);
        }
        let (_, cancel) = job(&app, &id)?;
        let result = (|| {
            let target = model(&app, "extraction")?;
            hash(&target, &manifest("extraction")?)?;
            state
                .model_status
                .lock()
                .unwrap()
                .insert("extraction".into(), "loading".into());
            fs::write(path.join("prompt.txt"), prompt).map_err(|_| error())?;
            fs::write(path.join("schema.json"), schema).map_err(|_| error())?;
            run(
                &app,
                "llama-completion",
                &[
                    "-m".into(),
                    target.to_string_lossy().into(),
                    "-f".into(),
                    path.join("prompt.txt").to_string_lossy().into(),
                    "-jf".into(),
                    path.join("schema.json").to_string_lossy().into(),
                    "-n".into(),
                    "4096".into(),
                    "-c".into(),
                    "32768".into(),
                    "-ngl".into(),
                    "0".into(),
                    "--temp".into(),
                    "0".into(),
                    "--no-display-prompt".into(),
                    "--no-conversation".into(),
                    "--simple-io".into(),
                ],
                &path,
                &cancel,
            )
        })();
        state.model_status.lock().unwrap().insert(
            "extraction".into(),
            if result.is_ok() { "ready" } else { "error" }.into(),
        );
        cleanup(&app, &id);
        result
    })
    .await
    .map_err(|_| error())?
}
#[cfg(test)]
mod tests {
    use super::*;
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
