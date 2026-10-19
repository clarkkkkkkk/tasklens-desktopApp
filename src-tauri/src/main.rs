#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assets;
mod jobs;
mod local_ai;
mod ocr;
mod platform;
mod reliability;
mod voice;
use tauri::Manager;

fn main() {
    let instance =
        tauri_plugin_single_instance::Builder::new().callback(|app, _, _| reliability::reopen(app));
    // Isolate native acceptance from the developer's already-running window. Release identity is fixed.
    #[cfg(all(debug_assertions, target_os = "linux"))]
    let instance = if std::env::var("TAURI_WEBVIEW_AUTOMATION").as_deref() == Ok("true") {
        instance.dbus_id("app.tasklens.nativeAcceptance")
    } else {
        instance
    };
    tauri::Builder::default()
        .plugin(instance.build())
        .manage(reliability::Reliability::default())
        .manage(voice::VoiceState::default())
        .manage(jobs::Jobs::default())
        .manage(assets::Initialization::default())
        .manage(local_ai::server::Runtime::default())
        .setup(|app| {
            reliability::initialize(app.handle());
            let _ = reliability::tray(app.handle());
            if let Err(message) = voice::initialize(app.handle()) {
                *app.state::<voice::VoiceState>()
                    .initialization_error
                    .lock()
                    .unwrap() = Some(message);
            }
            ocr::initialize(app.handle()).map_err(std::io::Error::other)?;
            local_ai::initialize(app.handle()).map_err(std::io::Error::other)?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || assets::initialize(&handle, false));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            reliability::reminder_status,
            reliability::reminder_time_options,
            reliability::reminder_take_activation,
            reliability::reminder_pause,
            reliability::reminder_reconcile,
            reliability::reminder_preview,
            reliability::reminder_activate,
            reliability::reminder_disable,
            reliability::reminder_preferences,
            reliability::reminder_test,
            reliability::lifecycle_finish,
            assets::local_intelligence_status,
            assets::local_intelligence_retry,
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
            local_ai::local_ai_prewarm,
            local_ai::local_jobs_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("TaskLens could not start")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                reliability::shutdown(app);
                local_ai::shutdown(app);
            }
        });
}
