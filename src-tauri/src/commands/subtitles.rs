use serde::Serialize;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager};

use super::media::is_video;
use crate::embedded_subtitles::{self, EmbeddedTrack};
use crate::error::{AppError, AppResult};

/// Sidecar subtitle formats the frontend can parse (lower-case, no dot).
const SUBTITLE_EXTENSIONS: &[&str] = &["srt", "vtt"];

/// Largest subtitle file read. Real ones are well under 1 MiB; the cap keeps a
/// mislabelled huge file from being pulled into memory and sent over IPC.
const MAX_SUBTITLE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct SubtitleFile {
    pub path: String,
    pub name: String,
}

fn is_subtitle(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SUBTITLE_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Whether `candidate` belongs to the video whose file stem is `video_stem`:
/// `movie.srt`, `movie.en.srt`, `movie.vi.forced.vtt`, compared case-insensitively.
fn is_sidecar_of(candidate: &Path, video_stem: &str) -> bool {
    let Some(stem) = candidate.file_stem().and_then(|s| s.to_str()) else {
        return false;
    };
    let stem = stem.to_lowercase();
    let video_stem = video_stem.to_lowercase();
    stem == video_stem
        || stem
            .strip_prefix(&video_stem)
            .is_some_and(|rest| rest.starts_with('.'))
}

/// Subtitle files next to `video` that share its name, sorted by file name.
fn sidecars(video: &Path) -> AppResult<Vec<SubtitleFile>> {
    let invalid = || AppError::InvalidPath(video.display().to_string());
    if !is_video(video) {
        return Err(invalid());
    }
    let dir = video.parent().ok_or_else(invalid)?;
    let stem = video
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(invalid)?;
    let mut found: Vec<SubtitleFile> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| is_subtitle(p) && is_sidecar_of(p, stem) && p.is_file())
        .filter_map(|p| {
            let name = p.file_name()?.to_str()?.to_string();
            let path = p.to_str()?.to_string();
            Some(SubtitleFile { path, name })
        })
        .collect();
    found.sort_by_cached_key(|f| f.name.to_lowercase());
    Ok(found)
}

/// Raw bytes of a subtitle file of at most `limit` bytes. Decoding is left to the
/// frontend, which has every legacy text encoding through `TextDecoder`.
fn read_subtitle(path: &Path, limit: u64) -> AppResult<Vec<u8>> {
    if !is_subtitle(path) || !std::fs::metadata(path)?.is_file() {
        return Err(AppError::InvalidPath(path.display().to_string()));
    }
    // Read one byte past the limit instead of trusting the size from a stat,
    // so a file that grows in between is still caught.
    let mut bytes = Vec::new();
    File::open(path)?
        .take(limit.saturating_add(1))
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(AppError::FileTooLarge {
            path: path.display().to_string(),
            limit,
        });
    }
    Ok(bytes)
}

/// Subtitle files beside a video, named after it (`movie.srt`, `movie.en.vtt`, …).
#[tauri::command]
pub async fn find_subtitle_files(video_path: String) -> AppResult<Vec<SubtitleFile>> {
    // Listing a folder can stall on network drives; keep it off the async workers.
    tauri::async_runtime::spawn_blocking(move || sidecars(Path::new(&video_path))).await?
}

/// The bytes of one `.srt` / `.vtt` file, returned as a raw `ArrayBuffer`.
#[tauri::command]
pub async fn read_subtitle_file(path: String) -> AppResult<Response> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        read_subtitle(Path::new(&path), MAX_SUBTITLE_BYTES)
    })
    .await??;
    Ok(Response::new(bytes))
}

/// Numbers embedded-subtitle extractions; only the latest keeps reading, so switching
/// videos stops a long walk through the previous file.
#[derive(Default)]
pub struct LatestExtraction(AtomicU64);

/// Text subtitle streams inside a video. `None` when a newer extraction started
/// before this one finished: the caller has moved on to another video.
#[tauri::command]
pub async fn extract_embedded_subtitles(
    app: AppHandle,
    video_path: String,
) -> AppResult<Option<Vec<EmbeddedTrack>>> {
    // Walking a large Matroska file blocks; keep it off the async workers.
    tauri::async_runtime::spawn_blocking(move || {
        let latest = &app.state::<LatestExtraction>().0;
        let ticket = latest.fetch_add(1, Ordering::SeqCst) + 1;
        let path = Path::new(&video_path);
        if !is_video(path) {
            return Err(AppError::InvalidPath(video_path.clone()));
        }
        match embedded_subtitles::extract(path, &|| latest.load(Ordering::SeqCst) != ticket) {
            Ok(tracks) => Ok(Some(tracks)),
            Err(AppError::Superseded) => Ok(None),
            Err(err) => Err(err),
        }
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn names(files: &[SubtitleFile]) -> Vec<&str> {
        files.iter().map(|f| f.name.as_str()).collect()
    }

    #[test]
    fn sidecar_names_match_the_video_stem_case_insensitively() {
        assert!(is_sidecar_of(Path::new("/v/Movie.srt"), "movie"));
        assert!(is_sidecar_of(Path::new("/v/movie.en.srt"), "movie"));
        assert!(is_sidecar_of(Path::new("/v/movie.vi.forced.vtt"), "movie"));
        assert!(!is_sidecar_of(Path::new("/v/movie2.srt"), "movie"));
        assert!(!is_sidecar_of(Path::new("/v/other.srt"), "movie"));
        assert!(is_sidecar_of(Path::new("/v/a.b.en.srt"), "a.b"));
    }

    #[test]
    fn finds_only_matching_subtitle_files_sorted() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        for name in [
            "movie.mp4",
            "movie.vi.srt",
            "movie.EN.vtt",
            "movie.srt",
            "movie.txt",
            "movie2.srt",
            "other.srt",
        ] {
            fs::write(root.join(name), b"x").unwrap();
        }
        fs::create_dir_all(root.join("movie.fr.srt")).unwrap();

        let found = sidecars(&root.join("movie.mp4")).unwrap();
        assert_eq!(names(&found), ["movie.EN.vtt", "movie.srt", "movie.vi.srt"]);
        assert_eq!(
            found[1].path,
            root.join("movie.srt").to_str().unwrap().to_string()
        );
    }

    #[test]
    fn finding_subtitles_requires_a_video_path() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            sidecars(&dir.path().join("notes.txt")),
            Err(AppError::InvalidPath(_))
        ));
    }

    #[test]
    fn reads_subtitle_bytes_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.srt");
        let bytes = [0xEF, 0xBB, 0xBF, b'1', b'\n', 0xFF];
        fs::write(&path, bytes).unwrap();
        assert_eq!(read_subtitle(&path, 100).unwrap(), bytes);
    }

    #[test]
    fn refuses_other_files_and_oversized_subtitles() {
        let dir = tempfile::tempdir().unwrap();
        let text = dir.path().join("secret.txt");
        fs::write(&text, b"secret").unwrap();
        assert!(matches!(
            read_subtitle(&text, 100),
            Err(AppError::InvalidPath(_))
        ));

        let folder = dir.path().join("folder.srt");
        fs::create_dir_all(&folder).unwrap();
        assert!(matches!(
            read_subtitle(&folder, 100),
            Err(AppError::InvalidPath(_))
        ));

        let big = dir.path().join("big.vtt");
        fs::write(&big, [b'x'; 11]).unwrap();
        assert!(matches!(
            read_subtitle(&big, 10),
            Err(AppError::FileTooLarge { limit: 10, .. })
        ));
        assert_eq!(read_subtitle(&big, 11).unwrap().len(), 11);

        assert!(matches!(
            read_subtitle(&dir.path().join("gone.srt"), 100),
            Err(AppError::Io(_))
        ));
    }
}
