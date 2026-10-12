#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod jobs;
mod local_ai;
mod ocr;
mod platform;
mod voice;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .manage(voice::VoiceState::default())
        .manage(jobs::Jobs::default())
        .manage(local_ai::server::Runtime::default())
        .setup(|app| {
            voice::initialize(app.handle()).map_err(std::io::Error::other)?;
            ocr::initialize(app.handle()).map_err(std::io::Error::other)?;
            local_ai::initialize(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            voice::voice_models,
            voice::voice_validate_model,
            voice::voice_start,
            voice::voice_stop,
            voice::voice_import_begin,
            voice::voice_import_chunk,
            voice::voice_cancel,
            voice::voice_transcribe,
            ocr::ocr_recognize,
            ocr::ocr_status,
            ocr::ocr_import_languages,
            local_ai::local_ai_status,
            local_ai::local_ai_diagnostics,
            local_ai::local_ai_import_model,
            local_ai::local_ai_validate_model,
            local_ai::local_ai_load,
            local_ai::local_ai_unload,
            local_ai::local_ai_complete,
            local_ai::local_jobs_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("TaskLens could not start")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                local_ai::shutdown(app);
            }
        });
}
