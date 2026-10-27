mod commands;
mod error;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Must be registered first. Opening a file while the app is running hands the
    // path to the existing window instead of starting a second player.
    #[cfg(desktop)]
    {
        use tauri::Emitter;
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let files = commands::media::media_files_from_args(
                argv.into_iter().skip(1).map(Into::into),
                std::path::Path::new(&cwd),
            );
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if !files.is_empty() {
                commands::media::allow_media(app, &files);
                let _ = app.emit("open-files", files);
            }
        }));
    }

    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    builder
        .invoke_handler(tauri::generate_handler![
            commands::media::scan_directory,
            commands::media::get_media_info,
            commands::media::get_startup_media_files,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
