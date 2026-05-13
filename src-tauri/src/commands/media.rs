use serde::Serialize;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};

/// Supported video file extensions (lower-case, no dot).
pub const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "webm", "mov", "avi", "wmv", "flv", "m4v", "ts", "mpg", "mpeg", "3gp", "ogv",
];

#[derive(Debug, Serialize, Clone)]
pub struct MediaFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub extension: String,
    pub modified: Option<u64>,
}

fn is_video(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn to_media_file(path: PathBuf) -> AppResult<MediaFile> {
    let meta = std::fs::metadata(&path)?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    let path_str = path
        .to_str()
        .ok_or_else(|| AppError::InvalidPath(path.display().to_string()))?
        .to_string();
    Ok(MediaFile {
        path: path_str,
        name,
        size: meta.len(),
        extension,
        modified,
    })
}

#[tauri::command]
pub async fn scan_directory(path: String, recursive: bool) -> AppResult<Vec<MediaFile>> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(AppError::InvalidPath(path));
    }
    let max_depth = if recursive { usize::MAX } else { 1 };
    let mut out = Vec::new();
    for entry in WalkDir::new(&root)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let p = entry.path();
        if p.is_file() && is_video(p) {
            if let Ok(mf) = to_media_file(p.to_path_buf()) {
                out.push(mf);
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub async fn get_media_info(path: String) -> AppResult<MediaFile> {
    to_media_file(PathBuf::from(path))
}
