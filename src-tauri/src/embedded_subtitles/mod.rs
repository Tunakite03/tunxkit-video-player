//! Text subtitle streams inside video files, read straight from the container.
//!
//! The webview can't be relied on for these: WebView2 (Chromium) exposes no in-band
//! text tracks to scripts, and WKWebView none for WebM. Both readers only touch the
//! bytes they need: Matroska skips past every non-subtitle block, and MP4 seeks to the
//! subtitle samples its sample tables point at.

mod matroska;
mod mp4;

use serde::Serialize;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use crate::error::{AppError, AppResult};

/// Largest single subtitle sample read; anything bigger is not a line of text.
const MAX_SAMPLE_BYTES: u64 = 1024 * 1024;

/// How long a cue without a stated duration stays up when no later cue ends it.
const FALLBACK_CUE_SECONDS: f64 = 5.0;

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct EmbeddedCue {
    /// Seconds.
    pub start: f64,
    /// Seconds.
    pub end: f64,
    /// Cue text with SRT-style markup (`<i>`, `<b>`, `<u>`), lines split by `\n`.
    pub text: String,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct EmbeddedTrack {
    /// Track number (Matroska) or track ID (MP4), unique within the file.
    pub id: u64,
    pub name: Option<String>,
    /// ISO 639-2 or BCP 47 code, when the file names a language.
    pub language: Option<String>,
    /// Short codec tag for display: "SRT", "ASS", "SSA", "VTT", "TX3G".
    pub codec: &'static str,
    pub default: bool,
    pub forced: bool,
    pub cues: Vec<EmbeddedCue>,
}

/// A cue whose end may only be known once the next one starts.
struct PendingCue {
    start: f64,
    end: Option<f64>,
    text: String,
}

/// Sort cues and end those without a duration where the next one starts.
fn finish_cues(mut pending: Vec<PendingCue>) -> Vec<EmbeddedCue> {
    pending.sort_by(|a, b| a.start.total_cmp(&b.start));
    let starts: Vec<f64> = pending.iter().map(|c| c.start).collect();
    pending
        .into_iter()
        .enumerate()
        .filter_map(|(i, cue)| {
            let end = cue.end.unwrap_or_else(|| {
                starts[i + 1..]
                    .iter()
                    .copied()
                    .find(|&s| s > cue.start)
                    .map_or(cue.start + FALLBACK_CUE_SECONDS, |next| {
                        next.min(cue.start + FALLBACK_CUE_SECONDS)
                    })
            });
            (end > cue.start && !cue.text.trim().is_empty()).then_some(EmbeddedCue {
                start: cue.start,
                end,
                text: cue.text,
            })
        })
        .collect()
}

/// Text of an ASS/SSA event as Matroska stores it
/// (`ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text`), with override
/// blocks reduced to italic/bold/underline tags and `\N` turned into line breaks.
fn ass_event_text(event: &str) -> String {
    let text = event.splitn(9, ',').nth(8).unwrap_or("");
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(c) = rest.chars().next() {
        match c {
            '{' => match rest.find('}') {
                Some(close) => {
                    for tag in rest[1..close].split('\\').skip(1) {
                        out.push_str(ass_style_tag(tag));
                    }
                    rest = &rest[close + 1..];
                }
                None => {
                    out.push('{');
                    rest = &rest[1..];
                }
            },
            '\\' if rest[1..].starts_with(['N', 'n']) => {
                out.push('\n');
                rest = &rest[2..];
            }
            '\\' if rest[1..].starts_with('h') => {
                out.push('\u{a0}');
                rest = &rest[2..];
            }
            _ => {
                out.push(c);
                rest = &rest[c.len_utf8()..];
            }
        }
    }
    out
}

/// `i1` → `<i>`, `i0` → `</i>`, likewise `b` (any weight) and `u`; other tags vanish.
fn ass_style_tag(tag: &str) -> &'static str {
    let mut chars = tag.chars();
    let (Some(name), value) = (chars.next(), chars.as_str()) else {
        return "";
    };
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return "";
    }
    let on = value != "0";
    match (name, on) {
        ('i', true) => "<i>",
        ('i', false) => "</i>",
        ('b', true) => "<b>",
        ('b', false) => "</b>",
        ('u', true) => "<u>",
        ('u', false) => "</u>",
        _ => "",
    }
}

/// Seconds from a count of `units` per second.
fn seconds(ticks: i128, units_per_second: u64) -> f64 {
    ticks as f64 / units_per_second as f64
}

/// Every readable text subtitle stream in the video at `path`. A container this
/// doesn't read (Ogg) has none. `superseded` is polled while reading; when it turns
/// true the read stops with `AppError::Superseded`.
pub fn extract(path: &Path, superseded: &dyn Fn() -> bool) -> AppResult<Vec<EmbeddedTrack>> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut magic = [0u8; 8];
    let len = read_up_to(&mut reader, &mut magic)?;
    reader.seek(SeekFrom::Start(0))?;
    if matroska::sniff(&magic[..len]) {
        matroska::extract(&mut reader, superseded)
    } else if mp4::sniff(&magic[..len]) {
        mp4::extract(&mut reader, superseded)
    } else {
        Ok(Vec::new())
    }
}

/// Fill as much of `buf` as the reader has; returns how many bytes that was.
fn read_up_to(reader: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match reader.read(&mut buf[filled..])? {
            0 => break,
            n => filled += n,
        }
    }
    Ok(filled)
}

fn check(superseded: &dyn Fn() -> bool) -> AppResult<()> {
    if superseded() {
        Err(AppError::Superseded)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending(start: f64, end: Option<f64>, text: &str) -> PendingCue {
        PendingCue {
            start,
            end,
            text: text.to_string(),
        }
    }

    #[test]
    fn ass_events_keep_basic_styling_and_line_breaks() {
        let event =
            r"3,0,Default,,0,0,0,,{\an8\i1}Xin chào,{\i0} bạn\Nline {\b700}two{\b0}\hok {\blur3}x";
        assert_eq!(
            ass_event_text(event),
            "<i>Xin chào,</i> bạn\nline <b>two</b>\u{a0}ok x"
        );
        assert_eq!(ass_event_text("1,0,Default,,0,0,0,,{unclosed"), "{unclosed");
        assert_eq!(ass_event_text("too,few,fields"), "");
    }

    #[test]
    fn cues_without_a_duration_end_where_the_next_begins() {
        let cues = finish_cues(vec![
            pending(4.0, None, "b"),
            pending(1.0, None, "a"),
            pending(20.0, None, "c"),
            pending(30.0, Some(31.0), "d"),
            pending(40.0, Some(39.0), "backwards"),
            pending(50.0, Some(51.0), "  "),
        ]);
        let ends: Vec<(f64, f64, &str)> = cues
            .iter()
            .map(|c| (c.start, c.end, c.text.as_str()))
            .collect();
        assert_eq!(
            ends,
            [
                (1.0, 4.0, "a"),
                (4.0, 9.0, "b"),
                (20.0, 25.0, "c"),
                (30.0, 31.0, "d")
            ]
        );
    }

    #[test]
    fn other_containers_have_no_embedded_subtitles() {
        let dir = tempfile::tempdir().unwrap();
        let ogg = dir.path().join("a.ogv");
        std::fs::write(&ogg, b"OggS\0\x02rest").unwrap();
        assert_eq!(extract(&ogg, &|| false).unwrap(), []);
        let tiny = dir.path().join("b.mp4");
        std::fs::write(&tiny, b"x").unwrap();
        assert_eq!(extract(&tiny, &|| false).unwrap(), []);
    }
}
