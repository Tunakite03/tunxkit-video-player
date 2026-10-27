mod commands;
mod error;

use commands::media::{self, OpenQueue};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().manage(OpenQueue::default());

    // Must be registered first. Opening a file while the app is running hands the
    // path to the existing window instead of starting a second player.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let files = media::media_files_from_args(
                argv.into_iter().skip(1).map(Into::into),
                std::path::Path::new(&cwd),
            );
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            media::open_media(app, files);
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
            media::scan_directory,
            media::get_media_info,
            media::take_pending_media_files,
            media::get_video_extensions,
        ])
        .setup(|app| {
            // Files passed on the command line wait in the queue until the frontend asks.
            let cwd = std::env::current_dir().unwrap_or_default();
            let files = media::media_files_from_args(std::env::args_os().skip(1), &cwd);
            media::open_media(app.handle(), files);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        // Only used on macOS, where Finder hands opened files over as an event
        // rather than as launch arguments.
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths = urls.into_iter().filter_map(|url| url.to_file_path().ok());
                media::open_media(_app, media::media_files_at(paths));
            }
        });
}
