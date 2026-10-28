//! Matroska / WebM: a streaming walk over the EBML elements. Segment, Cluster and
//! BlockGroup are entered without reading their size, which also handles live-written
//! files with unknown sizes; Info and Tracks are read whole; blocks of other tracks are
//! skipped after their few header bytes, so a long video's frames are never read.

use flate2::read::ZlibDecoder;
use std::collections::HashMap;
use std::io::{self, BufReader, ErrorKind, Read, Seek};

use super::{
    ass_event_text, check, finish_cues, seconds, EmbeddedTrack, PendingCue, MAX_SAMPLE_BYTES,
};
use crate::error::{AppError, AppResult};

const EBML_MAGIC: [u8; 4] = [0x1A, 0x45, 0xDF, 0xA3];

const SEGMENT: u32 = 0x1853_8067;
const INFO: u32 = 0x1549_A966;
const TIMESTAMP_SCALE: u32 = 0x2A_D7B1;
const TRACKS: u32 = 0x1654_AE6B;
const TRACK_ENTRY: u32 = 0xAE;
const TRACK_NUMBER: u32 = 0xD7;
const TRACK_TYPE: u32 = 0x83;
const CODEC_ID: u32 = 0x86;
const NAME: u32 = 0x536E;
const LANGUAGE: u32 = 0x22_B59C;
const LANGUAGE_BCP47: u32 = 0x22_B59D;
const FLAG_DEFAULT: u32 = 0x88;
const FLAG_FORCED: u32 = 0x55AA;
const CONTENT_ENCODINGS: u32 = 0x6D80;
const CONTENT_ENCODING: u32 = 0x6240;
const CONTENT_ENCODING_TYPE: u32 = 0x5033;
const CONTENT_COMPRESSION: u32 = 0x5034;
const CONTENT_COMP_ALGO: u32 = 0x4254;
const CONTENT_COMP_SETTINGS: u32 = 0x4255;
const CLUSTER: u32 = 0x1F43_B675;
const CLUSTER_TIMESTAMP: u32 = 0xE7;
const BLOCK_GROUP: u32 = 0xA0;
const BLOCK: u32 = 0xA1;
const BLOCK_DURATION: u32 = 0x9B;
const SIMPLE_BLOCK: u32 = 0xA3;

const TRACK_TYPE_SUBTITLE: u64 = 0x11;
/// Info and Tracks are metadata; anything larger is not a real file.
const MAX_HEADER_ELEMENT_BYTES: u64 = 16 * 1024 * 1024;

pub fn sniff(magic: &[u8]) -> bool {
    magic.starts_with(&EBML_MAGIC)
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum TextFormat {
    Srt,
    /// Matroska's `S_TEXT/WEBVTT`: the block holds only the cue text.
    WebVtt,
    /// WebM's `D_WEBVTT/*`: the block holds the cue id line, the settings line, then the text.
    WebmVtt,
    Ass,
    Ssa,
}

impl TextFormat {
    fn from_codec(codec: &str) -> Option<Self> {
        match codec {
            "S_TEXT/UTF8" | "S_TEXT/ASCII" => Some(Self::Srt),
            "S_TEXT/WEBVTT" => Some(Self::WebVtt),
            "D_WEBVTT/SUBTITLES" | "D_WEBVTT/CAPTIONS" => Some(Self::WebmVtt),
            "S_TEXT/ASS" | "S_ASS" => Some(Self::Ass),
            "S_TEXT/SSA" | "S_SSA" => Some(Self::Ssa),
            // Bitmap (PGS, VobSub, DVB) and rare text formats can't become text cues.
            _ => None,
        }
    }

    fn tag(self) -> &'static str {
        match self {
            Self::Srt => "SRT",
            Self::WebVtt | Self::WebmVtt => "VTT",
            Self::Ass => "ASS",
            Self::Ssa => "SSA",
        }
    }
}

#[derive(Debug, PartialEq)]
enum Compression {
    None,
    Zlib,
    /// Bytes the muxer removed from the start of every frame.
    HeaderStripping(Vec<u8>),
}

struct SubtitleTrack {
    number: u64,
    format: TextFormat,
    compression: Compression,
    name: Option<String>,
    language: Option<String>,
    default: bool,
    forced: bool,
    cues: Vec<PendingCue>,
}

/// An element's ID and payload size; `None` size means "unknown" (all ones).
struct Header {
    id: u32,
    size: Option<u64>,
}

fn invalid(what: &str) -> io::Error {
    io::Error::new(ErrorKind::InvalidData, what.to_string())
}

/// A variable-length integer's total length from its first byte, 1..=8.
fn vint_len(first: u8) -> Option<usize> {
    (first != 0).then(|| first.leading_zeros() as usize + 1)
}

/// The next element header, or `None` at the end of the stream.
fn read_header(r: &mut impl Read) -> io::Result<Option<Header>> {
    let mut first = [0u8; 1];
    if r.read(&mut first)? == 0 {
        return Ok(None);
    }
    let id_len = vint_len(first[0])
        .filter(|&n| n <= 4)
        .ok_or_else(|| invalid("bad element id"))?;
    let mut id = first[0] as u32;
    for _ in 1..id_len {
        id = (id << 8) | read_u8(r)? as u32;
    }
    let size_first = read_u8(r)?;
    let size_len = vint_len(size_first).ok_or_else(|| invalid("bad element size"))?;
    let mut size = (size_first as u64) & (0xFF >> size_len);
    let mut all_ones = size == (0xFF >> size_len);
    for _ in 1..size_len {
        let b = read_u8(r)?;
        all_ones &= b == 0xFF;
        size = (size << 8) | b as u64;
    }
    Ok(Some(Header {
        id,
        size: (!all_ones).then_some(size),
    }))
}

fn read_u8(r: &mut impl Read) -> io::Result<u8> {
    let mut b = [0u8; 1];
    r.read_exact(&mut b)?;
    Ok(b[0])
}

/// A block's track number (a vint without its marker) and how many bytes it took.
fn read_track_number(r: &mut impl Read) -> io::Result<(u64, u64)> {
    let first = read_u8(r)?;
    let len = vint_len(first).ok_or_else(|| invalid("bad track number"))?;
    let mut value = (first as u64) & (0xFF >> len);
    for _ in 1..len {
        value = (value << 8) | read_u8(r)? as u64;
    }
    Ok((value, len as u64))
}

fn uint(data: &[u8]) -> u64 {
    data.iter().take(8).fold(0, |acc, &b| (acc << 8) | b as u64)
}

fn string(data: &[u8]) -> String {
    String::from_utf8_lossy(data)
        .trim_end_matches('\0')
        .to_string()
}

/// Child elements of an in-memory master element.
fn children(mut data: &[u8]) -> io::Result<Vec<(u32, &[u8])>> {
    let mut out = Vec::new();
    while !data.is_empty() {
        let mut cursor = data;
        let header = read_header(&mut cursor)?.ok_or_else(|| invalid("truncated element"))?;
        let consumed = data.len() - cursor.len();
        let size = match header.size {
            Some(size) => usize::try_from(size).map_err(|_| invalid("element too large"))?,
            None => cursor.len(),
        };
        if size > cursor.len() {
            return Err(invalid("element runs past its parent"));
        }
        out.push((header.id, &data[consumed..consumed + size]));
        data = &data[consumed + size..];
    }
    Ok(out)
}

fn read_body(r: &mut impl Read, size: Option<u64>) -> io::Result<Vec<u8>> {
    let size = size.ok_or_else(|| invalid("metadata element of unknown size"))?;
    if size > MAX_HEADER_ELEMENT_BYTES {
        return Err(invalid("metadata element too large"));
    }
    let mut body = vec![0u8; size as usize];
    r.read_exact(&mut body)?;
    Ok(body)
}

fn compression(encodings: &[u8]) -> io::Result<Option<Compression>> {
    let mut result = Compression::None;
    for (id, encoding) in children(encodings)? {
        if id != CONTENT_ENCODING {
            continue;
        }
        let fields = children(encoding)?;
        let encoding_type = fields
            .iter()
            .find(|(id, _)| *id == CONTENT_ENCODING_TYPE)
            .map_or(0, |(_, d)| uint(d));
        if encoding_type != 0 {
            // Encrypted: unreadable.
            return Ok(None);
        }
        let Some((_, settings)) = fields.iter().find(|(id, _)| *id == CONTENT_COMPRESSION) else {
            continue;
        };
        let settings = children(settings)?;
        let algo = settings
            .iter()
            .find(|(id, _)| *id == CONTENT_COMP_ALGO)
            .map_or(0, |(_, d)| uint(d));
        result = match algo {
            0 => Compression::Zlib,
            3 => Compression::HeaderStripping(
                settings
                    .iter()
                    .find(|(id, _)| *id == CONTENT_COMP_SETTINGS)
                    .map(|(_, d)| d.to_vec())
                    .unwrap_or_default(),
            ),
            // bzlib and lzo1x: not worth a dependency for subtitles nobody writes.
            _ => return Ok(None),
        };
    }
    Ok(Some(result))
}

fn subtitle_track(entry: &[u8]) -> io::Result<Option<SubtitleTrack>> {
    let fields = children(entry)?;
    let field = |id: u32| fields.iter().find(|(f, _)| *f == id).map(|(_, d)| *d);
    if field(TRACK_TYPE).map(uint) != Some(TRACK_TYPE_SUBTITLE) {
        return Ok(None);
    }
    let Some(number) = field(TRACK_NUMBER).map(uint) else {
        return Ok(None);
    };
    let codec = field(CODEC_ID).map(string).unwrap_or_default();
    let Some(format) = TextFormat::from_codec(&codec) else {
        log::info!("skipping unsupported subtitle track {number}: codec {codec}");
        return Ok(None);
    };
    let compression = match field(CONTENT_ENCODINGS) {
        Some(encodings) => match compression(encodings)? {
            Some(c) => c,
            None => {
                log::info!("skipping subtitle track {number}: unsupported content encoding");
                return Ok(None);
            }
        },
        None => Compression::None,
    };
    // Matroska's default language is English; "und" means it was never set.
    let language = field(LANGUAGE_BCP47)
        .or(field(LANGUAGE))
        .map(string)
        .unwrap_or_else(|| "eng".to_string());
    Ok(Some(SubtitleTrack {
        number,
        format,
        compression,
        name: field(NAME).map(string).filter(|n| !n.is_empty()),
        language: (language != "und" && !language.is_empty()).then_some(language),
        default: field(FLAG_DEFAULT).map_or(true, |d| uint(d) != 0),
        forced: field(FLAG_FORCED).is_some_and(|d| uint(d) != 0),
        cues: Vec::new(),
    }))
}

fn decode_payload(track: &SubtitleTrack, data: Vec<u8>) -> io::Result<String> {
    let bytes = match &track.compression {
        Compression::None => data,
        Compression::HeaderStripping(prefix) => [prefix.as_slice(), &data].concat(),
        Compression::Zlib => {
            let mut out = Vec::new();
            ZlibDecoder::new(data.as_slice())
                .take(MAX_SAMPLE_BYTES)
                .read_to_end(&mut out)?;
            out
        }
    };
    let text = string(&bytes);
    Ok(match track.format {
        TextFormat::Srt | TextFormat::WebVtt => text,
        TextFormat::WebmVtt => text.splitn(3, '\n').nth(2).unwrap_or("").to_string(),
        TextFormat::Ass | TextFormat::Ssa => ass_event_text(&text),
    })
}

/// Skip `n` bytes, staying inside the buffer when the skip is short.
fn skip<R: Read + Seek>(r: &mut BufReader<R>, n: u64) -> io::Result<()> {
    let n = i64::try_from(n).map_err(|_| invalid("element too large"))?;
    r.seek_relative(n)
}

/// What the walk has learned so far.
struct Walk {
    scale_ns: u64,
    tracks: HashMap<u64, SubtitleTrack>,
    tracks_seen: bool,
    cluster_time: u64,
    /// The cue a BlockGroup's Block just added, which its BlockDuration then ends.
    group_cue: Option<(u64, usize)>,
}

enum Step {
    Continue,
    Done,
}

fn step<R: Read + Seek>(walk: &mut Walk, r: &mut BufReader<R>) -> io::Result<Step> {
    let Some(header) = read_header(r)? else {
        return Ok(Step::Done);
    };
    match header.id {
        SEGMENT | BLOCK_GROUP => walk.group_cue = None,
        CLUSTER => {
            walk.group_cue = None;
            if !walk.tracks_seen {
                log::warn!("matroska cluster before any track list; not reading subtitles");
                return Ok(Step::Done);
            }
        }
        INFO => {
            for (id, data) in children(&read_body(r, header.size)?)? {
                if id == TIMESTAMP_SCALE && uint(data) > 0 {
                    walk.scale_ns = uint(data);
                }
            }
        }
        TRACKS => {
            walk.tracks_seen = true;
            for (id, entry) in children(&read_body(r, header.size)?)? {
                if id == TRACK_ENTRY {
                    if let Some(track) = subtitle_track(entry)? {
                        walk.tracks.insert(track.number, track);
                    }
                }
            }
            // Most videos carry no subtitles: no need to walk their clusters.
            if walk.tracks.is_empty() {
                return Ok(Step::Done);
            }
        }
        CLUSTER_TIMESTAMP => walk.cluster_time = uint(&read_body(r, header.size)?),
        SIMPLE_BLOCK | BLOCK => {
            let size = header
                .size
                .ok_or_else(|| invalid("block of unknown size"))?;
            let (number, number_len) = read_track_number(r)?;
            let mut rest = [0u8; 3];
            r.read_exact(&mut rest)?;
            let payload = size
                .checked_sub(number_len + 3)
                .ok_or_else(|| invalid("block shorter than its header"))?;
            let laced = rest[2] & 0x06 != 0;
            let Some(track) = walk.tracks.get_mut(&number) else {
                skip(r, payload)?;
                return Ok(Step::Continue);
            };
            if laced || payload > MAX_SAMPLE_BYTES {
                skip(r, payload)?;
                return Ok(Step::Continue);
            }
            let mut data = vec![0u8; payload as usize];
            r.read_exact(&mut data)?;
            let relative = i16::from_be_bytes([rest[0], rest[1]]) as i128;
            let ticks = (walk.cluster_time as i128 + relative).max(0) * walk.scale_ns as i128;
            track.cues.push(PendingCue {
                start: seconds(ticks, 1_000_000_000),
                end: None,
                text: decode_payload(track, data)?,
            });
            walk.group_cue = (header.id == BLOCK).then(|| (number, track.cues.len() - 1));
        }
        BLOCK_DURATION => {
            let duration = uint(&read_body(r, header.size)?);
            if let Some((number, index)) = walk.group_cue.take() {
                let track = walk.tracks.get_mut(&number);
                if let Some(cue) = track.and_then(|t| t.cues.get_mut(index)) {
                    let ticks = duration as i128 * walk.scale_ns as i128;
                    cue.end = Some(cue.start + seconds(ticks, 1_000_000_000));
                }
            }
        }
        // Another master element of unknown size: its children follow, so read on.
        _ => {
            if let Some(size) = header.size {
                skip(r, size)?;
            }
        }
    }
    Ok(Step::Continue)
}

pub fn extract<R: Read + Seek>(
    r: &mut BufReader<R>,
    superseded: &dyn Fn() -> bool,
) -> AppResult<Vec<EmbeddedTrack>> {
    let mut walk = Walk {
        scale_ns: 1_000_000,
        tracks: HashMap::new(),
        tracks_seen: false,
        cluster_time: 0,
        group_cue: None,
    };
    loop {
        check(superseded)?;
        match step(&mut walk, r) {
            Ok(Step::Continue) => {}
            Ok(Step::Done) => break,
            // A file cut off mid-element: keep the cues read up to there.
            Err(err) if err.kind() == ErrorKind::UnexpectedEof && walk.tracks_seen => {
                log::warn!("matroska file ends mid-element; keeping the subtitles read so far");
                break;
            }
            Err(err) => return Err(AppError::Io(err)),
        }
    }

    let mut out: Vec<EmbeddedTrack> = walk
        .tracks
        .into_values()
        .map(|track| EmbeddedTrack {
            id: track.number,
            name: track.name,
            language: track.language,
            codec: track.format.tag(),
            default: track.default,
            forced: track.forced,
            cues: finish_cues(track.cues),
        })
        .filter(|t| !t.cues.is_empty())
        .collect();
    out.sort_by_key(|t| t.id);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::ZlibEncoder;
    use std::io::{Cursor, Write};

    /// An element with an 8-byte size, so tests needn't pick size widths.
    fn el(id: u32, body: &[u8]) -> Vec<u8> {
        let id_bytes = id.to_be_bytes();
        let skip = id_bytes.iter().take_while(|&&b| b == 0).count();
        let mut out = id_bytes[skip..].to_vec();
        out.push(0x01);
        out.extend_from_slice(&(body.len() as u64).to_be_bytes()[1..]);
        out.extend_from_slice(body);
        out
    }

    /// Same, with the "unknown size" marker.
    fn el_unknown(id: u32, body: &[u8]) -> Vec<u8> {
        let id_bytes = id.to_be_bytes();
        let skip = id_bytes.iter().take_while(|&&b| b == 0).count();
        let mut out = id_bytes[skip..].to_vec();
        out.push(0xFF);
        out.extend_from_slice(body);
        out
    }

    fn uint_el(id: u32, value: u64) -> Vec<u8> {
        el(id, &value.to_be_bytes())
    }

    fn block(id: u32, track: u8, relative: i16, data: &[u8]) -> Vec<u8> {
        let mut body = vec![0x80 | track];
        body.extend_from_slice(&relative.to_be_bytes());
        body.push(0);
        body.extend_from_slice(data);
        el(id, &body)
    }

    fn track_entry(number: u64, kind: u64, codec: &str, extra: &[Vec<u8>]) -> Vec<u8> {
        let mut body = [
            uint_el(TRACK_NUMBER, number),
            uint_el(TRACK_TYPE, kind),
            el(CODEC_ID, codec.as_bytes()),
        ]
        .concat();
        for e in extra {
            body.extend_from_slice(e);
        }
        el(TRACK_ENTRY, &body)
    }

    fn file(tracks: &[Vec<u8>], clusters: &[Vec<u8>]) -> Vec<u8> {
        let segment = [
            vec![el(INFO, &uint_el(TIMESTAMP_SCALE, 1_000_000))],
            vec![el(TRACKS, &tracks.concat())],
            clusters.to_vec(),
        ]
        .concat()
        .concat();
        [el(0x1A45_DFA3, b"webm"), el_unknown(SEGMENT, &segment)].concat()
    }

    fn read(bytes: Vec<u8>) -> AppResult<Vec<EmbeddedTrack>> {
        extract(&mut BufReader::new(Cursor::new(bytes)), &|| false)
    }

    #[test]
    fn reads_srt_and_ass_tracks_and_skips_video_blocks() {
        let ass_private = el(0x63A2, b"[Script Info]");
        let tracks = [
            track_entry(1, 1, "V_VP9", &[]),
            track_entry(
                2,
                TRACK_TYPE_SUBTITLE,
                "S_TEXT/UTF8",
                &[el(LANGUAGE, b"vie"), el(NAME, b"Vietsub")],
            ),
            track_entry(
                3,
                TRACK_TYPE_SUBTITLE,
                "S_TEXT/ASS",
                &[
                    ass_private,
                    uint_el(FLAG_FORCED, 1),
                    uint_el(FLAG_DEFAULT, 0),
                ],
            ),
            track_entry(4, TRACK_TYPE_SUBTITLE, "S_HDMV/PGS", &[]),
        ];
        let cluster = el_unknown(
            CLUSTER,
            &[
                uint_el(CLUSTER_TIMESTAMP, 10_000),
                block(SIMPLE_BLOCK, 1, 0, &[0xAB; 5000]),
                el(
                    BLOCK_GROUP,
                    &[
                        block(BLOCK, 2, 500, "Xin <i>chào</i>".as_bytes()),
                        uint_el(BLOCK_DURATION, 1500),
                    ]
                    .concat(),
                ),
                block(
                    SIMPLE_BLOCK,
                    3,
                    2000,
                    br"7,0,Default,,0,0,0,,{\i1}Hi{\i0}\Nthere",
                ),
                block(SIMPLE_BLOCK, 4, 0, &[0x00; 64]),
            ]
            .concat(),
        );
        let found = read(file(&tracks, &[cluster])).unwrap();
        assert_eq!(found.len(), 2);

        let srt = &found[0];
        assert_eq!((srt.id, srt.codec), (2, "SRT"));
        assert_eq!(srt.name.as_deref(), Some("Vietsub"));
        assert_eq!(srt.language.as_deref(), Some("vie"));
        assert!(srt.default && !srt.forced);
        assert_eq!(srt.cues.len(), 1);
        assert_eq!((srt.cues[0].start, srt.cues[0].end), (10.5, 12.0));
        assert_eq!(srt.cues[0].text, "Xin <i>chào</i>");

        let ass = &found[1];
        assert_eq!((ass.id, ass.codec), (3, "ASS"));
        assert_eq!(ass.language.as_deref(), Some("eng"));
        assert!(!ass.default && ass.forced);
        assert_eq!(ass.cues[0].start, 12.0);
        assert_eq!(ass.cues[0].text, "<i>Hi</i>\nthere");
    }

    #[test]
    fn decompresses_zlib_and_header_stripped_tracks() {
        let mut zlib = ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        zlib.write_all(b"compressed line").unwrap();
        let zlib = zlib.finish().unwrap();
        let encoding = |algo: u64, settings: &[u8]| {
            el(
                CONTENT_ENCODINGS,
                &el(
                    CONTENT_ENCODING,
                    &el(
                        CONTENT_COMPRESSION,
                        &[
                            uint_el(CONTENT_COMP_ALGO, algo),
                            el(CONTENT_COMP_SETTINGS, settings),
                        ]
                        .concat(),
                    ),
                ),
            )
        };
        let tracks = [
            track_entry(1, TRACK_TYPE_SUBTITLE, "S_TEXT/UTF8", &[encoding(0, b"")]),
            track_entry(
                2,
                TRACK_TYPE_SUBTITLE,
                "S_TEXT/UTF8",
                &[encoding(3, b"Hello ")],
            ),
            track_entry(3, TRACK_TYPE_SUBTITLE, "S_TEXT/UTF8", &[encoding(2, b"")]),
            track_entry(4, TRACK_TYPE_SUBTITLE, "D_WEBVTT/SUBTITLES", &[]),
        ];
        let cluster = el(
            CLUSTER,
            &[
                uint_el(CLUSTER_TIMESTAMP, 0),
                block(SIMPLE_BLOCK, 1, 0, &zlib),
                block(SIMPLE_BLOCK, 2, 0, b"world"),
                block(SIMPLE_BLOCK, 3, 0, b"lzo"),
                block(SIMPLE_BLOCK, 4, 0, b"cue-7\nalign:start\nVTT <b>text</b>"),
            ]
            .concat(),
        );
        let found = read(file(&tracks, &[cluster])).unwrap();
        let texts: Vec<(u64, &str)> = found
            .iter()
            .map(|t| (t.id, t.cues[0].text.as_str()))
            .collect();
        assert_eq!(
            texts,
            [
                (1, "compressed line"),
                (2, "Hello world"),
                (4, "VTT <b>text</b>")
            ]
        );
    }

    #[test]
    fn stops_after_the_track_list_when_there_are_no_subtitles() {
        let tracks = [track_entry(1, 1, "V_VP9", &[])];
        // Garbage where clusters would be: never reached.
        let mut bytes = file(&tracks, &[]);
        bytes.extend_from_slice(&[0x00; 16]);
        assert_eq!(read(bytes).unwrap(), []);
    }

    #[test]
    fn keeps_cues_read_before_the_file_was_cut_off() {
        let tracks = [track_entry(1, TRACK_TYPE_SUBTITLE, "S_TEXT/UTF8", &[])];
        let cluster = el(
            CLUSTER,
            &[
                uint_el(CLUSTER_TIMESTAMP, 0),
                block(SIMPLE_BLOCK, 1, 0, b"first"),
                block(SIMPLE_BLOCK, 1, 1000, b"second"),
            ]
            .concat(),
        );
        let mut bytes = file(&tracks, &[cluster]);
        bytes.truncate(bytes.len() - 3);
        let found = read(bytes).unwrap();
        assert_eq!(found[0].cues.len(), 1);
        assert_eq!(found[0].cues[0].text, "first");
    }

    #[test]
    fn stops_when_superseded() {
        let tracks = [track_entry(1, TRACK_TYPE_SUBTITLE, "S_TEXT/UTF8", &[])];
        let bytes = file(&tracks, &[]);
        let result = extract(&mut BufReader::new(Cursor::new(bytes)), &|| true);
        assert!(matches!(result, Err(AppError::Superseded)));
    }
}
