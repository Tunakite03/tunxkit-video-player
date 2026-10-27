use serde::Serialize;
use std::ffi::OsString;
use std::fs::Metadata;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};

/// Containers the system webview can play (lower-case, no dot). The frontend imports the
/// same file; `fileAssociations` in tauri.conf.json must match it (checked by a test).
fn video_extensions() -> &'static [String] {
    static EXTENSIONS: OnceLock<Vec<String>> = OnceLock::new();
    EXTENSIONS.get_or_init(|| {
        serde_json::from_str(include_str!("../../video-extensions.json"))
            .expect("video-extensions.json must be an array of strings")
    })
}

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
        .map(|e| video_extensions().contains(&e.to_lowercase()))
        .unwrap_or(false)
}

fn to_media_file(path: PathBuf, meta: &Metadata) -> AppResult<MediaFile> {
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

/// Metadata for a single video file; anything else is rejected.
fn media_file_at(path: PathBuf) -> AppResult<MediaFile> {
    let meta = std::fs::metadata(&path)?;
    if !meta.is_file() || !is_video(&path) {
        return Err(AppError::InvalidPath(path.display().to_string()));
    }
    to_media_file(path, &meta)
}

fn scan(root: &Path, recursive: bool) -> AppResult<Vec<MediaFile>> {
    if !root.exists() {
        return Err(AppError::InvalidPath(root.display().to_string()));
    }
    let max_depth = if recursive { usize::MAX } else { 1 };
    let mut out: Vec<MediaFile> = WalkDir::new(root)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| is_video(e.path()))
        .filter_map(|e| {
            // Symlinked files still count, so stat through the link for those.
            let meta = if e.path_is_symlink() {
                std::fs::metadata(e.path()).ok()?
            } else {
                e.metadata().ok()?
            };
            if !meta.is_file() {
                return None;
            }
            to_media_file(e.into_path(), &meta).ok()
        })
        .collect();
    out.sort_by_cached_key(|f| f.name.to_lowercase());
    Ok(out)
}

/// Video files named on a command line, resolving relative paths against `cwd`.
pub fn media_files_from_args(
    args: impl IntoIterator<Item = OsString>,
    cwd: &Path,
) -> Vec<MediaFile> {
    args.into_iter()
        .map(PathBuf::from)
        .map(|p| if p.is_relative() { cwd.join(p) } else { p })
        .filter_map(|p| media_file_at(p).ok())
        .collect()
}

/// Let the webview stream these files through the asset protocol, whose static scope is empty.
pub fn allow_media(app: &AppHandle, files: &[MediaFile]) {
    let scope = app.asset_protocol_scope();
    for file in files {
        if let Err(err) = scope.allow_file(&file.path) {
            log::warn!("could not allow asset access to {}: {err}", file.path);
        }
    }
}

#[tauri::command]
pub async fn scan_directory(
    app: AppHandle,
    path: String,
    recursive: bool,
) -> AppResult<Vec<MediaFile>> {
    // Walking a large tree blocks, and so does granting access (it canonicalizes
    // every path), so keep both off the async runtime's workers.
    tauri::async_runtime::spawn_blocking(move || {
        let files = scan(Path::new(&path), recursive)?;
        allow_media(&app, &files);
        Ok(files)
    })
    .await?
}

#[tauri::command]
pub async fn get_media_info(app: AppHandle, path: String) -> AppResult<MediaFile> {
    let file = media_file_at(PathBuf::from(path))?;
    allow_media(&app, std::slice::from_ref(&file));
    Ok(file)
}

#[tauri::command]
pub async fn get_startup_media_files(app: AppHandle) -> AppResult<Vec<MediaFile>> {
    let cwd = std::env::current_dir().unwrap_or_default();
    let files = media_files_from_args(std::env::args_os().skip(1), &cwd);
    allow_media(&app, &files);
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"x").unwrap();
    }

    fn names(files: &[MediaFile]) -> Vec<&str> {
        files.iter().map(|f| f.name.as_str()).collect()
    }

    #[test]
    fn recognises_video_extensions_case_insensitively() {
        assert!(is_video(Path::new("clip.MP4")));
        assert!(is_video(Path::new("/a/b/movie.mkv")));
        assert!(!is_video(Path::new("notes.txt")));
        assert!(!is_video(Path::new("clip.avi")));
        assert!(!is_video(Path::new("mp4")));
    }

    #[test]
    fn scan_finds_videos_sorted_and_respects_recursion() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("b.mp4"));
        touch(&root.join("A.webm"));
        touch(&root.join("notes.txt"));
        touch(&root.join("sub").join("c.mkv"));
        fs::create_dir_all(root.join("folder.mp4")).unwrap();

        let all = scan(root, true).unwrap();
        assert_eq!(names(&all), ["A.webm", "b.mp4", "c.mkv"]);
        assert_eq!(all[1].extension, "mp4");
        assert_eq!(all[1].size, 1);

        let flat = scan(root, false).unwrap();
        assert_eq!(names(&flat), ["A.webm", "b.mp4"]);
    }

    #[test]
    fn scan_of_a_single_file_returns_that_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("one.mov");
        touch(&file);
        assert_eq!(names(&scan(&file, true).unwrap()), ["one.mov"]);
    }

    #[test]
    fn scan_rejects_a_missing_root() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            scan(&dir.path().join("nope"), true),
            Err(AppError::InvalidPath(_))
        ));
    }

    #[test]
    fn media_file_at_only_accepts_video_files() {
        let dir = tempfile::tempdir().unwrap();
        let video = dir.path().join("v.mp4");
        let text = dir.path().join("t.txt");
        touch(&video);
        touch(&text);
        fs::create_dir_all(dir.path().join("d.mp4")).unwrap();

        assert_eq!(media_file_at(video).unwrap().name, "v.mp4");
        assert!(matches!(media_file_at(text), Err(AppError::InvalidPath(_))));
        assert!(media_file_at(dir.path().join("d.mp4")).is_err());
        assert!(matches!(
            media_file_at(dir.path().join("gone.mp4")),
            Err(AppError::Io(_))
        ));
    }

    #[test]
    fn args_resolve_relative_paths_and_skip_non_videos() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("rel.mp4"));
        touch(&dir.path().join("abs.webm"));
        touch(&dir.path().join("readme.md"));
        let args = [
            OsString::from("rel.mp4"),
            dir.path().join("abs.webm").into_os_string(),
            OsString::from("readme.md"),
            OsString::from("missing.mp4"),
        ];
        assert_eq!(
            names(&media_files_from_args(args, dir.path())),
            ["rel.mp4", "abs.webm"]
        );
    }

    #[test]
    fn file_associations_match_the_shared_extension_list() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        let mut associated: Vec<String> = conf["bundle"]["fileAssociations"]
            .as_array()
            .expect("bundle.fileAssociations")
            .iter()
            .flat_map(|a| a["ext"].as_array().unwrap().iter())
            .map(|e| e.as_str().unwrap().to_lowercase())
            .collect();
        let mut shared = video_extensions().to_vec();
        associated.sort();
        shared.sort();
        assert_eq!(
            associated, shared,
            "update fileAssociations in tauri.conf.json"
        );
    }
}
