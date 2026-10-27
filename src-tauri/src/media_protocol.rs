//! `media://` streams local videos to the webview in byte ranges.
//!
//! It replaces Tauri's asset protocol, which on every request canonicalizes the path,
//! glob-matches it against every file ever granted (up to `MAX_SCAN_FILES` per scan),
//! sniffs the MIME type from the first 8 KiB, caps the reply at ~1 MB, and reads the
//! whole file into memory when a request has no `Range` header. High-bitrate videos
//! made WKWebView fire many small requests, each paying that cost, and playback stalled.

use percent_encoding::percent_decode_str;
use std::borrow::Cow;
use std::collections::HashSet;
use std::fs::File;
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::RwLock;
use tauri::http::header::{
    ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_ORIGIN, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE,
};
use tauri::http::{HeaderValue, Method, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, UriSchemeResponder};

pub const SCHEME: &str = "media";

/// Most bytes one response carries. Bigger chunks mean fewer round trips through
/// WKWebView's scheme handler for high-bitrate video; the media stack asks again for the rest.
const MAX_CHUNK: u64 = 4 * 1024 * 1024;

type MediaResponse = Response<Cow<'static, [u8]>>;

/// Files the webview may stream: exactly the paths the backend handed to the frontend.
#[derive(Default)]
pub struct MediaAccess(RwLock<HashSet<String>>);

impl MediaAccess {
    pub fn allow<'a>(&self, paths: impl IntoIterator<Item = &'a str>) {
        let mut allowed = self.0.write().unwrap_or_else(|e| e.into_inner());
        allowed.extend(paths.into_iter().map(str::to_owned));
    }

    fn is_allowed(&self, path: &str) -> bool {
        self.0
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .contains(path)
    }
}

/// Serve one `media://` request. Disk reads happen off the main thread; the reply is
/// handed back on it.
pub fn handle(app: AppHandle, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    tauri::async_runtime::spawn_blocking(move || {
        let response = respond_to(&app.state::<MediaAccess>(), &request);
        // WebKit cancels range requests whenever the media stack seeks or switches source,
        // on the main thread. wry only checks for that just before replying, so replying
        // from this thread could still hit a stopped task. Replying on the main thread
        // serializes the check with the cancellation.
        if let Err(err) = app.run_on_main_thread(move || responder.respond(response)) {
            log::warn!(
                "could not deliver media response for {}: {err}",
                request.uri()
            );
        }
    });
}

fn respond_to(access: &MediaAccess, request: &Request<Vec<u8>>) -> MediaResponse {
    serve(access, request).unwrap_or_else(status_only)
}

fn serve(access: &MediaAccess, request: &Request<Vec<u8>>) -> Result<MediaResponse, StatusCode> {
    let raw_path = request.uri().path();
    let path = percent_decode_str(raw_path.strip_prefix('/').unwrap_or(raw_path))
        .decode_utf8()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    if !access.is_allowed(&path) {
        log::warn!("media request for a path that was never granted: {path}");
        return Err(StatusCode::FORBIDDEN);
    }

    let (mut file, len) = open(&path).map_err(io_status(&path))?;

    let range = match request.headers().get(RANGE) {
        Some(header) => {
            let header = header.to_str().map_err(|_| StatusCode::BAD_REQUEST)?;
            let range = byte_range(header, len);
            Some(range.ok_or(StatusCode::RANGE_NOT_SATISFIABLE)?)
        }
        // Never read a whole multi-GB file into memory: a large file without a Range
        // header gets its first chunk as a partial reply, which media stacks accept.
        None if len > MAX_CHUNK => Some((0, MAX_CHUNK - 1)),
        None => None,
    };

    let builder = Response::builder()
        .header(CONTENT_TYPE, mime_type(Path::new(path.as_ref())))
        .header(ACCEPT_RANGES, "bytes");
    let (builder, start, end) = match range {
        Some((start, end)) => {
            let end = end.min(start + MAX_CHUNK - 1);
            let builder = builder
                .status(StatusCode::PARTIAL_CONTENT)
                .header(CONTENT_RANGE, format!("bytes {start}-{end}/{len}"));
            (builder, start, end)
        }
        // No Range header, and the whole file fits in one chunk.
        None => (builder.status(StatusCode::OK), 0, len.saturating_sub(1)),
    };
    let nbytes = if len == 0 { 0 } else { end + 1 - start };
    let builder = builder.header(CONTENT_LENGTH, nbytes);

    if request.method() == Method::HEAD {
        return build(builder, Vec::new());
    }
    let body = read_range(&mut file, start, nbytes);
    build(builder, body.map_err(io_status(&path))?)
}

/// The first range of a `Range: bytes=…` header, inclusive and clamped to the file,
/// or `None` when it is malformed or starts past the end.
fn byte_range(header: &str, len: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    let (start, end) = spec.split(',').next()?.trim().split_once('-')?;
    let last = len.checked_sub(1)?;
    let (start, end) = match (start.trim(), end.trim()) {
        ("", suffix) => {
            let suffix: u64 = suffix.parse().ok()?;
            if suffix == 0 {
                return None;
            }
            (len.saturating_sub(suffix), last)
        }
        (start, "") => (start.parse().ok()?, last),
        (start, end) => (start.parse().ok()?, end.parse::<u64>().ok()?.min(last)),
    };
    (start <= end).then_some((start, end))
}

fn open(path: &str) -> std::io::Result<(File, u64)> {
    let file = File::open(path)?;
    let len = file.metadata()?.len();
    Ok((file, len))
}

fn read_range(file: &mut File, start: u64, nbytes: u64) -> std::io::Result<Vec<u8>> {
    let mut body = Vec::with_capacity(nbytes as usize);
    file.seek(SeekFrom::Start(start))?;
    file.take(nbytes).read_to_end(&mut body)?;
    Ok(body)
}

/// Picked from the extension; the scan only ever grants these containers.
fn mime_type(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase);
    match extension.as_deref() {
        Some("mp4" | "m4v") => "video/mp4",
        Some("mov") => "video/quicktime",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("ogv") => "video/ogg",
        _ => "application/octet-stream",
    }
}

/// Maps a failed read of `path` to the status to answer with, logging why.
fn io_status(path: &str) -> impl Fn(std::io::Error) -> StatusCode + '_ {
    move |err| {
        log::warn!("could not read media file {path}: {err}");
        match err.kind() {
            ErrorKind::NotFound => StatusCode::NOT_FOUND,
            ErrorKind::PermissionDenied => StatusCode::FORBIDDEN,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

/// Every reply allows any origin: thumbnails draw frames to a canvas from a
/// `crossorigin="anonymous"` video, and only this app's webview can reach the scheme.
fn build(
    builder: tauri::http::response::Builder,
    body: Vec<u8>,
) -> Result<MediaResponse, StatusCode> {
    builder
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Cow::Owned(body))
        .map_err(|err| {
            log::error!("could not build media response: {err}");
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

fn status_only(status: StatusCode) -> MediaResponse {
    let mut response = Response::new(Cow::Borrowed(&[][..]));
    *response.status_mut() = status;
    let any_origin = HeaderValue::from_static("*");
    response
        .headers_mut()
        .insert(ACCESS_CONTROL_ALLOW_ORIGIN, any_origin);
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn uri_for(path: &Path) -> String {
        let encoded = percent_encoding::utf8_percent_encode(
            path.to_str().unwrap(),
            percent_encoding::NON_ALPHANUMERIC,
        );
        format!("media://localhost/{encoded}")
    }

    fn get(access: &MediaAccess, path: &Path, range: Option<&str>) -> MediaResponse {
        let mut request = Request::builder().uri(uri_for(path));
        if let Some(range) = range {
            request = request.header(RANGE, range);
        }
        respond_to(access, &request.body(Vec::new()).unwrap())
    }

    fn header(response: &MediaResponse, name: tauri::http::HeaderName) -> &str {
        response.headers()[name].to_str().unwrap()
    }

    /// A granted file whose byte at offset `i` is `i % 251`, so any slice is checkable.
    fn granted_file(dir: &Path, name: &str, len: usize) -> (MediaAccess, std::path::PathBuf) {
        let path = dir.join(name);
        let bytes: Vec<u8> = (0..len).map(|i| (i % 251) as u8).collect();
        fs::write(&path, bytes).unwrap();
        let access = MediaAccess::default();
        access.allow([path.to_str().unwrap()]);
        (access, path)
    }

    fn expected(start: usize, end: usize) -> Vec<u8> {
        (start..=end).map(|i| (i % 251) as u8).collect()
    }

    #[test]
    fn byte_range_parses_the_forms_media_stacks_send() {
        assert_eq!(byte_range("bytes=0-1", 100), Some((0, 1)));
        assert_eq!(byte_range("bytes=10-", 100), Some((10, 99)));
        assert_eq!(byte_range("bytes=-30", 100), Some((70, 99)));
        assert_eq!(byte_range("bytes=-300", 100), Some((0, 99)));
        assert_eq!(byte_range("bytes=90-500", 100), Some((90, 99)));
        assert_eq!(byte_range("bytes=5-9, 20-29", 100), Some((5, 9)));
        assert_eq!(byte_range("bytes=100-", 100), None);
        assert_eq!(byte_range("bytes=9-5", 100), None);
        assert_eq!(byte_range("bytes=-0", 100), None);
        assert_eq!(byte_range("items=0-1", 100), None);
        assert_eq!(byte_range("bytes=0-", 0), None);
    }

    #[test]
    fn serves_the_requested_range() {
        let dir = tempfile::tempdir().unwrap();
        let (access, path) = granted_file(dir.path(), "clip.mp4", 1000);

        let response = get(&access, &path, Some("bytes=100-199"));
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(header(&response, CONTENT_RANGE), "bytes 100-199/1000");
        assert_eq!(header(&response, CONTENT_LENGTH), "100");
        assert_eq!(header(&response, CONTENT_TYPE), "video/mp4");
        assert_eq!(header(&response, ACCEPT_RANGES), "bytes");
        assert_eq!(response.body().as_ref(), expected(100, 199));
    }

    #[test]
    fn caps_a_range_at_one_chunk() {
        let dir = tempfile::tempdir().unwrap();
        let len = MAX_CHUNK as usize + 10;
        let (access, path) = granted_file(dir.path(), "big.mov", len);

        let response = get(&access, &path, Some("bytes=5-"));
        let end = 5 + MAX_CHUNK - 1;
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            header(&response, CONTENT_RANGE),
            format!("bytes 5-{end}/{len}")
        );
        assert_eq!(header(&response, CONTENT_TYPE), "video/quicktime");
        assert_eq!(response.body().as_ref(), expected(5, end as usize));
    }

    #[test]
    fn without_a_range_small_files_are_whole_and_large_ones_start_with_a_chunk() {
        let dir = tempfile::tempdir().unwrap();
        let (access, small) = granted_file(dir.path(), "small.webm", 300);
        let response = get(&access, &small, None);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body().as_ref(), expected(0, 299));

        let len = MAX_CHUNK as usize + 1;
        let (access, large) = granted_file(dir.path(), "large.mp4", len);
        let response = get(&access, &large, None);
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            header(&response, CONTENT_RANGE),
            format!("bytes 0-{}/{len}", MAX_CHUNK - 1)
        );
        assert_eq!(response.body().len() as u64, MAX_CHUNK);
    }

    #[test]
    fn head_requests_get_headers_only() {
        let dir = tempfile::tempdir().unwrap();
        let (access, path) = granted_file(dir.path(), "clip.mp4", 1000);
        let request = Request::builder()
            .method(Method::HEAD)
            .uri(uri_for(&path))
            .body(Vec::new())
            .unwrap();
        let response = respond_to(&access, &request);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(header(&response, CONTENT_LENGTH), "1000");
        assert!(response.body().is_empty());
    }

    #[test]
    fn rejects_unsatisfiable_ranges() {
        let dir = tempfile::tempdir().unwrap();
        let (access, path) = granted_file(dir.path(), "clip.mp4", 1000);
        let response = get(&access, &path, Some("bytes=1000-"));
        assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    }

    #[test]
    fn only_granted_files_are_served() {
        let dir = tempfile::tempdir().unwrap();
        let (access, granted) = granted_file(dir.path(), "ok.mp4", 10);
        let other = dir.path().join("other.mp4");
        fs::write(&other, b"secret").unwrap();
        assert_eq!(get(&access, &other, None).status(), StatusCode::FORBIDDEN);
        let sneaky = dir.path().join("sub").join("..").join("other.mp4");
        assert_eq!(get(&access, &sneaky, None).status(), StatusCode::FORBIDDEN);
        assert_eq!(get(&access, &granted, None).status(), StatusCode::OK);
    }

    #[test]
    fn a_granted_file_that_disappeared_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let (access, path) = granted_file(dir.path(), "gone.mp4", 10);
        fs::remove_file(&path).unwrap();
        let response = get(&access, &path, Some("bytes=0-1"));
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(header(&response, ACCESS_CONTROL_ALLOW_ORIGIN), "*");
    }

    #[test]
    fn decodes_percent_encoded_paths_with_spaces_and_unicode() {
        let dir = tempfile::tempdir().unwrap();
        let (access, path) = granted_file(dir.path(), "Phim hay – tập 1.mp4", 50);
        let response = get(&access, &path, Some("bytes=0-9"));
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body().as_ref(), expected(0, 9));
    }
}
