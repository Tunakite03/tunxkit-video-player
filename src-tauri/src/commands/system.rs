use crate::error::{AppError, AppResult};
use std::path::PathBuf;

/// Reveal a file or folder in the OS file explorer.
#[tauri::command]
pub async fn show_in_folder(path: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::InvalidPath(path));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", p.to_string_lossy().as_ref()])
            .spawn()
            .map_err(AppError::Io)?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", p.to_string_lossy().as_ref()])
            .spawn()
            .map_err(AppError::Io)?;
    }
    #[cfg(target_os = "linux")]
    {
        let parent = p.parent().unwrap_or(&p);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(AppError::Io)?;
    }

    Ok(())
}
