use serde::Serialize;
use std::ffi::OsString;
use std::fs::Metadata;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, State};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};

/// Containers WKWebView can't play, so macOS neither lists nor associates them.
const MACOS_UNSUPPORTED: &[&str] = &["mkv", "ogv"];

/// Most videos a single scan returns. Scanning a whole drive would otherwise
/// hold every match in memory and add each one to the asset scope.
pub const MAX_SCAN_FILES: usize = 10_000;

/// Containers listed in video-extensions.json (lower-case, no dot) that the webview on
/// macOS (`macos: true`) or elsewhere can play. `fileAssociations` in tauri.conf.json
/// and tauri.macos.conf.json must match this (checked by a test).
fn extensions_for(macos: bool) -> Vec<String> {
    let all: Vec<String> = serde_json::from_str(include_str!("../../video-extensions.json"))
        .expect("video-extensions.json must be an array of strings");
    all.into_iter()
        .filter(|e| !(macos && MACOS_UNSUPPORTED.contains(&e.as_str())))
        .collect()
}

/// Containers the system webview on this platform can play.
fn video_extensions() -> &'static [String] {
    static EXTENSIONS: OnceLock<Vec<String>> = OnceLock::new();
    EXTENSIONS.get_or_init(|| extensions_for(cfg!(target_os = "macos")))
}

#[derive(Debug, Serialize, Clone)]
pub struct MediaFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub extension: String,
    pub modified: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub files: Vec<MediaFile>,
    /// The scan stopped at `MAX_SCAN_FILES`, so some videos were left out.
    pub truncated: bool,
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

fn scan(root: &Path, recursive: bool, limit: usize) -> AppResult<ScanResult> {
    if !root.exists() {
        return Err(AppError::InvalidPath(root.display().to_string()));
    }
    let max_depth = if recursive { usize::MAX } else { 1 };
    let mut files: Vec<MediaFile> = WalkDir::new(root)
        .max_depth(max_depth)
        .follow_links(false)
        // A stable walk order keeps a truncated scan returning the same videos.
        .sort_by_file_name()
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
        .take(limit.saturating_add(1))
        .collect();
    let truncated = files.len() > limit;
    files.truncate(limit);
    files.sort_by_cached_key(|f| f.name.to_lowercase());
    Ok(ScanResult { files, truncated })
}

/// The video files among `paths`; anything missing or not a video is skipped.
pub fn media_files_at(paths: impl IntoIterator<Item = PathBuf>) -> Vec<MediaFile> {
    paths
        .into_iter()
        .filter_map(|p| media_file_at(p).ok())
        .collect()
}

/// Video files named on a command line, resolving relative paths against `cwd`.
pub fn media_files_from_args(
    args: impl IntoIterator<Item = OsString>,
    cwd: &Path,
) -> Vec<MediaFile> {
    media_files_at(args.into_iter().map(PathBuf::from).map(|p| {
        if p.is_relative() {
            cwd.join(p)
        } else {
            p
        }
    }))
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

/// Videos the OS asked us to open (launch arguments, "Open with", a second launch).
/// They wait here until the frontend has subscribed to `open-files` and taken them,
/// so files that arrive while the webview is still loading aren't lost.
#[derive(Default)]
pub struct OpenQueue(Mutex<OpenQueueState>);

#[derive(Default)]
struct OpenQueueState {
    ready: bool,
    pending: Vec<MediaFile>,
}

impl OpenQueue {
    /// Hands the files back for emitting once the frontend is ready, otherwise keeps them.
    fn push(&self, files: Vec<MediaFile>) -> Option<Vec<MediaFile>> {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if state.ready {
            Some(files)
        } else {
            state.pending.extend(files);
            None
        }
    }

    /// Marks the frontend ready and returns what arrived before it was.
    fn take(&self) -> Vec<MediaFile> {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        state.ready = true;
        std::mem::take(&mut state.pending)
    }
}

/// Grant access to files the OS asked us to open and pass them to the frontend.
pub fn open_media(app: &AppHandle, files: Vec<MediaFile>) {
    if files.is_empty() {
        return;
    }
    allow_media(app, &files);
    if let Some(files) = app.state::<OpenQueue>().push(files) {
        let _ = app.emit("open-files", files);
    }
}

#[tauri::command]
pub async fn scan_directory(
    app: AppHandle,
    path: String,
    recursive: bool,
) -> AppResult<ScanResult> {
    // Walking a large tree blocks, and so does granting access (it canonicalizes
    // every path), so keep both off the async runtime's workers.
    tauri::async_runtime::spawn_blocking(move || {
        let result = scan(Path::new(&path), recursive, MAX_SCAN_FILES)?;
        allow_media(&app, &result.files);
        Ok(result)
    })
    .await?
}

#[tauri::command]
pub async fn get_media_info(app: AppHandle, path: String) -> AppResult<MediaFile> {
    // Stat and canonicalize can stall on network drives; keep them off the workers too.
    tauri::async_runtime::spawn_blocking(move || {
        let file = media_file_at(PathBuf::from(path))?;
        allow_media(&app, std::slice::from_ref(&file));
        Ok(file)
    })
    .await?
}

/// Call after subscribing to `open-files`: returns the files opened before then.
#[tauri::command]
pub fn take_pending_media_files(queue: State<'_, OpenQueue>) -> Vec<MediaFile> {
    queue.take()
}

/// Extensions the file picker should offer on this platform.
#[tauri::command]
pub fn get_video_extensions() -> Vec<String> {
    video_extensions().to_vec()
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

    fn file(name: &str) -> MediaFile {
        MediaFile {
            path: format!("/v/{name}"),
            name: name.to_string(),
            size: 1,
            extension: "mp4".to_string(),
            modified: None,
        }
    }

    #[test]
    fn recognises_video_extensions_case_insensitively() {
        assert!(is_video(Path::new("clip.MP4")));
        assert!(is_video(Path::new("/a/b/movie.webm")));
        assert!(!is_video(Path::new("notes.txt")));
        assert!(!is_video(Path::new("clip.avi")));
        assert!(!is_video(Path::new("mp4")));
    }

    #[test]
    fn macos_drops_containers_wkwebview_cannot_play() {
        let everywhere = extensions_for(false);
        let macos = extensions_for(true);
        assert!(everywhere.iter().any(|e| e == "mkv"));
        assert!(!macos.iter().any(|e| e == "mkv" || e == "ogv"));
        assert!(macos.iter().any(|e| e == "mp4"));
    }

    #[test]
    fn scan_finds_videos_sorted_and_respects_recursion() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("b.mp4"));
        touch(&root.join("A.webm"));
        touch(&root.join("notes.txt"));
        touch(&root.join("sub").join("c.mov"));
        fs::create_dir_all(root.join("folder.mp4")).unwrap();

        let all = scan(root, true, MAX_SCAN_FILES).unwrap();
        assert_eq!(names(&all.files), ["A.webm", "b.mp4", "c.mov"]);
        assert!(!all.truncated);
        assert_eq!(all.files[1].extension, "mp4");
        assert_eq!(all.files[1].size, 1);

        let flat = scan(root, false, MAX_SCAN_FILES).unwrap();
        assert_eq!(names(&flat.files), ["A.webm", "b.mp4"]);
    }

    #[test]
    fn scan_stops_at_the_limit_and_says_so() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["a.mp4", "b.mp4", "c.mp4"] {
            touch(&dir.path().join(name));
        }
        let capped = scan(dir.path(), true, 2).unwrap();
        assert_eq!(names(&capped.files), ["a.mp4", "b.mp4"]);
        assert!(capped.truncated);

        let exact = scan(dir.path(), true, 3).unwrap();
        assert_eq!(exact.files.len(), 3);
        assert!(!exact.truncated);
    }

    #[test]
    fn scan_of_a_single_file_returns_that_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("one.mov");
        touch(&file);
        assert_eq!(
            names(&scan(&file, true, MAX_SCAN_FILES).unwrap().files),
            ["one.mov"]
        );
    }

    #[test]
    fn scan_rejects_a_missing_root() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            scan(&dir.path().join("nope"), true, MAX_SCAN_FILES),
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
    fn open_queue_holds_files_until_the_frontend_takes_them() {
        let queue = OpenQueue::default();
        assert!(queue.push(vec![file("a.mp4")]).is_none());
        assert!(queue.push(vec![file("b.mp4")]).is_none());
        assert_eq!(names(&queue.take()), ["a.mp4", "b.mp4"]);

        // Once taken, new files go straight out and nothing is left behind.
        let emitted = queue.push(vec![file("c.mp4")]).expect("emitted once ready");
        assert_eq!(names(&emitted), ["c.mp4"]);
        assert!(queue.take().is_empty());
    }

    fn associated_extensions(conf: &str) -> Vec<String> {
        let conf: serde_json::Value = serde_json::from_str(conf).unwrap();
        let mut associated: Vec<String> = conf["bundle"]["fileAssociations"]
            .as_array()
            .expect("bundle.fileAssociations")
            .iter()
            .flat_map(|a| a["ext"].as_array().unwrap().iter())
            .map(|e| e.as_str().unwrap().to_lowercase())
            .collect();
        associated.sort();
        associated
    }

    #[test]
    fn file_associations_match_the_shared_extension_list() {
        for (conf, macos, file) in [
            (
                include_str!("../../tauri.conf.json"),
                false,
                "tauri.conf.json",
            ),
            (
                include_str!("../../tauri.macos.conf.json"),
                true,
                "tauri.macos.conf.json",
            ),
        ] {
            let mut expected = extensions_for(macos);
            expected.sort();
            assert_eq!(
                associated_extensions(conf),
                expected,
                "update fileAssociations in {file}"
            );
        }
    }

    #[test]
    fn crate_version_matches_package_json() {
        let package: serde_json::Value =
            serde_json::from_str(include_str!("../../../package.json")).unwrap();
        assert_eq!(
            package["version"].as_str(),
            Some(env!("CARGO_PKG_VERSION")),
            "bump the version in Cargo.toml and package.json together"
        );
    }
}
