#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod voice;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .manage(voice::VoiceState::default())
        .setup(|app| {
            voice::initialize(app.handle()).map_err(std::io::Error::other)?;
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
            voice::local_extract
        ])
        .run(tauri::generate_context!())
        .expect("TaskLens could not start");
}
