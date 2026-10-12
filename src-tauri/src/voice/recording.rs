use super::audio;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::{
    path::PathBuf,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::Emitter;
pub struct Recording {
    pub stop: mpsc::Sender<()>,
    pub worker: thread::JoinHandle<Result<u64, String>>,
}
pub fn start(app: tauri::AppHandle, job_id: String, output: PathBuf) -> Result<Recording, String> {
    permission()?;
    let (stop, receiver) = mpsc::channel();
    let (ready, started) = mpsc::sync_channel(1);
    let worker = thread::spawn(move || {
        let result: Result<u64, String> = (|| {
            let device = cpal::default_host()
                .default_input_device()
                .ok_or("Microphone unavailable")?;
            let config = device
                .default_input_config()
                .map_err(|_| "Microphone unavailable or permission denied")?;
            let rate = config.sample_rate().0;
            let channels = config.channels() as usize;
            if !(8000..=192000).contains(&rate) || !(1..=8).contains(&channels) {
                return Err("Microphone format unsupported".into());
            }
            let data = Arc::new(Mutex::new(Vec::<f32>::new()));
            let failure = Arc::new(Mutex::new(false));
            let err = failure.clone();
            let sink = data.clone();
            let input_config = config.clone().into();
            macro_rules! stream {
                ($kind:ty, $convert:expr) => {{
                    device.build_input_stream(
                        &input_config,
                        move |input: &[$kind], _| {
                            let mut samples = sink.lock().unwrap();
                            for frame in input.chunks(channels) {
                                if samples.len() >= rate as usize * 300 {
                                    break;
                                }
                                samples.push(
                                    frame.iter().map($convert).sum::<f32>() / channels as f32,
                                );
                            }
                        },
                        move |_| {
                            *err.lock().unwrap() = true;
                        },
                        None,
                    )
                }};
            }
            let stream = match config.sample_format() {
                cpal::SampleFormat::F32 => stream!(f32, |x: &f32| *x),
                cpal::SampleFormat::I16 => stream!(i16, |x: &i16| *x as f32 / 32768.0),
                cpal::SampleFormat::U16 => stream!(u16, |x: &u16| (*x as f32 - 32768.0) / 32768.0),
                _ => return Err("Microphone format unsupported".into()),
            }
            .map_err(|_| "Microphone unavailable or permission denied")?;
            stream
                .play()
                .map_err(|_| "Microphone permission denied or device unavailable")?;
            let _ = ready.send(Ok(()));
            loop {
                if receiver.recv_timeout(Duration::from_millis(100)).is_ok() {
                    break;
                }
                if *failure.lock().unwrap() {
                    return Err("Microphone disconnected".into());
                }
                let samples = data.lock().unwrap();
                let elapsed = samples.len() as u64 * 1000 / rate as u64;
                let level = samples
                    .iter()
                    .rev()
                    .take(2048)
                    .map(|x| x.abs())
                    .fold(0.0_f32, f32::max);
                let _ = app.emit(
                    "voice-level",
                    serde_json::json!({"jobId":job_id,"elapsedMs":elapsed,"level":level}),
                );
                if elapsed >= 300000 {
                    break;
                }
            }
            drop(stream);
            let samples = data.lock().unwrap();
            audio::write_wav(&output, &audio::resample(&samples, rate)?)?;
            Ok(samples.len() as u64 * 1000 / rate as u64)
        })();
        if let Err(ref error) = result {
            let _ = ready.send(Err(error.clone()));
        }
        result
    });
    match started.recv().map_err(|_| "Microphone did not start")? {
        Ok(()) => Ok(Recording { stop, worker }),
        Err(e) => {
            let _ = worker.join();
            Err(e)
        }
    }
}
#[cfg(not(target_os = "macos"))]
fn permission() -> Result<(), String> {
    Ok(())
}
#[cfg(target_os = "macos")]
fn permission() -> Result<(), String> {
    use objc::{class, msg_send, sel, sel_impl};
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {
        static AVMediaTypeAudio: *mut objc::runtime::Object;
    }
    unsafe {
        let status: i64 =
            msg_send![class!(AVCaptureDevice), authorizationStatusForMediaType: AVMediaTypeAudio];
        if status == 3 {
            return Ok(());
        }
        if status != 0 {
            return Err("TaskLens needs microphone access to record voice notes.".into());
        }
        let (send, receive) = mpsc::channel();
        let callback = block::ConcreteBlock::new(move |granted: bool| {
            let _ = send.send(granted);
        })
        .copy();
        let _: () = msg_send![class!(AVCaptureDevice), requestAccessForMediaType: AVMediaTypeAudio completionHandler: &*callback];
        if receive.recv().unwrap_or(false) {
            Ok(())
        } else {
            Err("TaskLens needs microphone access to record voice notes.".into())
        }
    }
}
