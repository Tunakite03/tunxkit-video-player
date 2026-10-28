//! MP4 / MOV: subtitle tracks are found in `moov`, and their samples are read from
//! the offsets the sample tables give, so nothing else in the file is touched.
//! Fragmented files keep their samples in `moof` boxes instead and yield no cues.

use std::io::{self, BufReader, ErrorKind, Read, Seek, SeekFrom};

use super::{check, finish_cues, seconds, EmbeddedTrack, PendingCue, MAX_SAMPLE_BYTES};
use crate::error::AppResult;

/// `moov` of a multi-hour video is a few MB of sample tables; this is far beyond that.
const MAX_MOOV_BYTES: u64 = 128 * 1024 * 1024;

pub fn sniff(magic: &[u8]) -> bool {
    magic.len() >= 8
        && matches!(
            &magic[4..8],
            b"ftyp" | b"moov" | b"mdat" | b"free" | b"skip" | b"wide" | b"pnot"
        )
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum TextFormat {
    /// 3GPP timed text (`tx3g`) and QuickTime text (`text`): a length-prefixed string.
    TimedText,
    /// WebVTT in ISO BMFF (`wvtt`): `vttc` boxes holding a `payl` text box.
    WebVtt,
}

fn invalid(what: &str) -> io::Error {
    io::Error::new(ErrorKind::InvalidData, what.to_string())
}

fn be_u16(data: &[u8], at: usize) -> io::Result<u16> {
    data.get(at..at + 2)
        .map(|b| u16::from_be_bytes([b[0], b[1]]))
        .ok_or_else(|| invalid("box too short"))
}

fn be_u32(data: &[u8], at: usize) -> io::Result<u32> {
    data.get(at..at + 4)
        .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
        .ok_or_else(|| invalid("box too short"))
}

fn be_u64(data: &[u8], at: usize) -> io::Result<u64> {
    data.get(at..at + 8)
        .map(|b| u64::from_be_bytes(b.try_into().unwrap_or_default()))
        .ok_or_else(|| invalid("box too short"))
}

/// Child boxes of an in-memory box body.
fn boxes(mut data: &[u8]) -> io::Result<Vec<([u8; 4], &[u8])>> {
    let mut out = Vec::new();
    while data.len() >= 8 {
        let size32 = be_u32(data, 0)? as u64;
        let kind: [u8; 4] = data[4..8].try_into().unwrap_or_default();
        let (header, size) = match size32 {
            0 => (8, data.len() as u64),
            1 => (16, be_u64(data, 8)?),
            n => (8, n),
        };
        if size < header || size > data.len() as u64 {
            return Err(invalid("box runs past its parent"));
        }
        out.push((kind, &data[header as usize..size as usize]));
        data = &data[size as usize..];
    }
    Ok(out)
}

/// The first box at `path` below `data`.
fn find<'a>(data: &'a [u8], path: &[&[u8; 4]]) -> io::Result<Option<&'a [u8]>> {
    let Some((first, rest)) = path.split_first() else {
        return Ok(Some(data));
    };
    match boxes(data)?.into_iter().find(|(kind, _)| kind == *first) {
        Some((_, body)) => find(body, rest),
        None => Ok(None),
    }
}

/// `moov`'s body, read from wherever it sits among the top-level boxes.
fn read_moov<R: Read + Seek>(r: &mut BufReader<R>) -> io::Result<Option<Vec<u8>>> {
    loop {
        let mut head = [0u8; 8];
        match r.read_exact(&mut head) {
            Ok(()) => {}
            Err(err) if err.kind() == ErrorKind::UnexpectedEof => return Ok(None),
            Err(err) => return Err(err),
        }
        let size32 = be_u32(&head, 0)? as u64;
        let (header, size) = match size32 {
            // Extends to the end of the file, so nothing follows it.
            0 => return Ok(None),
            1 => {
                let mut large = [0u8; 8];
                r.read_exact(&mut large)?;
                (16, u64::from_be_bytes(large))
            }
            n => (8, n),
        };
        let body = size
            .checked_sub(header)
            .ok_or_else(|| invalid("bad box size"))?;
        if &head[4..8] == b"moov" {
            if body > MAX_MOOV_BYTES {
                return Err(invalid("moov box too large"));
            }
            let mut moov = vec![0u8; body as usize];
            r.read_exact(&mut moov)?;
            return Ok(Some(moov));
        }
        r.seek(SeekFrom::Current(
            i64::try_from(body).map_err(|_| invalid("bad box size"))?,
        ))?;
    }
}

/// Timescale (units per second) from `mvhd` or `mdhd`, and the latter's language field.
fn timescale_and_language(header: &[u8]) -> io::Result<(u32, u16)> {
    if header.first() == Some(&1) {
        Ok((be_u32(header, 20)?, be_u16(header, 32)?))
    } else {
        Ok((be_u32(header, 12)?, be_u16(header, 20)?))
    }
}

/// QuickTime's Macintosh language codes 0..=94 as ISO 639-2 (`.mov` files still use them).
const MAC_LANGUAGES: [&str; 95] = [
    "eng", "fra", "deu", "ita", "nld", "swe", "spa", "dan", "por", "nor", // 0
    "heb", "jpn", "ara", "fin", "ell", "isl", "mlt", "tur", "hrv", "zho", // 10
    "urd", "hin", "tha", "kor", "lit", "pol", "hun", "est", "lav", "sme", // 20
    "fao", "fas", "rus", "zho", "nld", "gle", "sqi", "ron", "ces", "slk", // 30
    "slv", "yid", "srp", "mkd", "bul", "ukr", "bel", "uzb", "kaz", "aze", // 40
    "aze", "hye", "kat", "ron", "kir", "tgk", "tuk", "mon", "mon", "pus", // 50
    "kur", "kas", "snd", "bod", "nep", "san", "mar", "ben", "asm", "guj", // 60
    "pan", "ori", "mal", "kan", "tam", "tel", "sin", "mya", "khm", "lao", // 70
    "vie", "ind", "tgl", "msa", "msa", "amh", "tir", "orm", "som", "swa", // 80
    "kin", "run", "nya", "mlg", "epo", // 90
];

/// Macintosh language codes 128..=150.
const MAC_LANGUAGES_128: [&str; 23] = [
    "cym", "eus", "cat", "lat", "que", "grn", "aym", "tat", "uig", "dzo", // 128
    "jav", "sun", "glg", "afr", "bre", "iku", "gla", "glv", "gle", "ton", // 138
    "ell", "kal", "aze", // 148
];

/// The `mdhd` language: an ISO 639-2/T code packed as three 5-bit letters, or below
/// 0x400 a Macintosh language code. 0x7FFF and "und" mean unspecified.
fn language(packed: u16) -> Option<String> {
    if packed < 0x400 {
        let code = match packed {
            0..=94 => MAC_LANGUAGES[packed as usize],
            128..=150 => MAC_LANGUAGES_128[packed as usize - 128],
            _ => return None,
        };
        return Some(code.to_string());
    }
    let code: String = [10, 5, 0]
        .iter()
        .map(|shift| char::from(((packed >> shift) & 0x1F) as u8 + 0x60))
        .collect();
    (code != "und" && code.chars().all(|c| c.is_ascii_lowercase())).then_some(code)
}

/// Seconds to add to media times: leading empty edits delay the track, and the first
/// real edit's media time trims its start.
fn edit_shift(elst: Option<&[u8]>, movie_scale: u32, media_scale: u32) -> io::Result<f64> {
    let Some(elst) = elst else {
        return Ok(0.0);
    };
    let wide = elst.first() == Some(&1);
    let entry_len = if wide { 20 } else { 12 };
    let mut empty = 0.0;
    for i in 0..be_u32(elst, 4)? as usize {
        let at = 8 + i * entry_len;
        let (duration, media_time) = if wide {
            (be_u64(elst, at)?, be_u64(elst, at + 8)? as i64)
        } else {
            (
                be_u32(elst, at)? as u64,
                be_u32(elst, at + 4)? as i32 as i64,
            )
        };
        if media_time == -1 {
            empty += seconds(duration as i128, movie_scale.max(1) as u64);
        } else {
            return Ok(empty - seconds(media_time as i128, media_scale.max(1) as u64));
        }
    }
    Ok(empty)
}

/// File offset and size of every sample, from the chunk tables.
fn sample_locations(stbl: &[u8]) -> io::Result<Vec<(u64, u32)>> {
    let stsz = find(stbl, &[b"stsz"])?.ok_or_else(|| invalid("missing stsz"))?;
    let fixed = be_u32(stsz, 4)?;
    let count = be_u32(stsz, 8)? as usize;
    let size_of = |i: usize| -> io::Result<u32> {
        if fixed != 0 {
            Ok(fixed)
        } else {
            be_u32(stsz, 12 + i * 4)
        }
    };
    let chunk_offsets: Vec<u64> = if let Some(stco) = find(stbl, &[b"stco"])? {
        (0..be_u32(stco, 4)? as usize)
            .map(|i| be_u32(stco, 8 + i * 4).map(u64::from))
            .collect::<io::Result<_>>()?
    } else if let Some(co64) = find(stbl, &[b"co64"])? {
        (0..be_u32(co64, 4)? as usize)
            .map(|i| be_u64(co64, 8 + i * 8))
            .collect::<io::Result<_>>()?
    } else {
        return Err(invalid("missing chunk offsets"));
    };
    let stsc = find(stbl, &[b"stsc"])?.ok_or_else(|| invalid("missing stsc"))?;
    let runs = be_u32(stsc, 4)? as usize;

    let mut locations = Vec::with_capacity(count.min(1 << 20));
    for run in 0..runs {
        let first_chunk = be_u32(stsc, 8 + run * 12)? as usize;
        let per_chunk = be_u32(stsc, 12 + run * 12)? as usize;
        let next_first = if run + 1 < runs {
            be_u32(stsc, 8 + (run + 1) * 12)? as usize
        } else {
            chunk_offsets.len() + 1
        };
        for chunk in first_chunk.max(1)..next_first.min(chunk_offsets.len() + 1) {
            let mut offset = chunk_offsets[chunk - 1];
            for _ in 0..per_chunk {
                if locations.len() >= count {
                    return Ok(locations);
                }
                let size = size_of(locations.len())?;
                locations.push((offset, size));
                offset += size as u64;
            }
        }
    }
    Ok(locations)
}

/// Each sample's (decode time, duration) in media units, from `stts`.
fn sample_times(stbl: &[u8], count: usize) -> io::Result<Vec<(u64, u32)>> {
    let stts = find(stbl, &[b"stts"])?.ok_or_else(|| invalid("missing stts"))?;
    let mut times = Vec::with_capacity(count.min(1 << 20));
    let mut time = 0u64;
    for i in 0..be_u32(stts, 4)? as usize {
        let run = be_u32(stts, 8 + i * 8)?;
        let delta = be_u32(stts, 12 + i * 8)?;
        for _ in 0..run {
            if times.len() >= count {
                return Ok(times);
            }
            times.push((time, delta));
            time += delta as u64;
        }
    }
    Ok(times)
}

/// Plain text made safe for the frontend's markup parser.
fn escape_markup(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;")
}

fn timed_text(sample: &[u8]) -> String {
    let Ok(len) = be_u16(sample, 0) else {
        return String::new();
    };
    let text = &sample[2..(2 + len as usize).min(sample.len())];
    let decoded = if let Some(utf16) = text.strip_prefix(&[0xFE, 0xFF]) {
        let units: Vec<u16> = utf16
            .chunks_exact(2)
            .map(|p| u16::from_be_bytes([p[0], p[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(text).into_owned()
    };
    escape_markup(&decoded)
}

fn webvtt_text(sample: &[u8]) -> io::Result<String> {
    let mut lines = Vec::new();
    for (kind, body) in boxes(sample)? {
        if &kind == b"vttc" {
            if let Some(payload) = find(body, &[b"payl"])? {
                lines.push(String::from_utf8_lossy(payload).into_owned());
            }
        }
    }
    Ok(lines.join("\n"))
}

struct TrackInfo<'a> {
    id: u64,
    enabled: bool,
    format: TextFormat,
    media_scale: u32,
    language: Option<String>,
    shift: f64,
    stbl: &'a [u8],
}

fn track_info<'a>(trak: &'a [u8], movie_scale: u32) -> io::Result<Option<TrackInfo<'a>>> {
    let Some(hdlr) = find(trak, &[b"mdia", b"hdlr"])? else {
        return Ok(None);
    };
    if !matches!(hdlr.get(8..12), Some(b"sbtl" | b"text" | b"subt")) {
        return Ok(None);
    }
    let tkhd = find(trak, &[b"tkhd"])?.ok_or_else(|| invalid("missing tkhd"))?;
    let id = be_u32(tkhd, if tkhd.first() == Some(&1) { 20 } else { 12 })? as u64;
    let mdhd = find(trak, &[b"mdia", b"mdhd"])?.ok_or_else(|| invalid("missing mdhd"))?;
    let (media_scale, packed_language) = timescale_and_language(mdhd)?;
    let stbl = find(trak, &[b"mdia", b"minf", b"stbl"])?.ok_or_else(|| invalid("missing stbl"))?;
    let stsd = find(stbl, &[b"stsd"])?.ok_or_else(|| invalid("missing stsd"))?;
    let format = match stsd.get(12..16) {
        Some(b"tx3g" | b"text") => TextFormat::TimedText,
        Some(b"wvtt") => TextFormat::WebVtt,
        other => {
            let name = other.map(String::from_utf8_lossy).unwrap_or_default();
            log::info!("skipping unsupported subtitle track {id}: sample format {name}");
            return Ok(None);
        }
    };
    Ok(Some(TrackInfo {
        id,
        enabled: tkhd.get(3).is_some_and(|flags| flags & 1 != 0),
        format,
        media_scale,
        language: language(packed_language),
        shift: edit_shift(find(trak, &[b"edts", b"elst"])?, movie_scale, media_scale)?,
        stbl,
    }))
}

fn read_track<R: Read + Seek>(
    r: &mut BufReader<R>,
    track: &TrackInfo,
    superseded: &dyn Fn() -> bool,
) -> AppResult<EmbeddedTrack> {
    let locations = sample_locations(track.stbl)?;
    let times = sample_times(track.stbl, locations.len())?;
    let scale = track.media_scale.max(1) as u64;
    let mut cues = Vec::new();
    for (&(offset, size), &(time, duration)) in locations.iter().zip(&times) {
        check(superseded)?;
        if size == 0 || size as u64 > MAX_SAMPLE_BYTES {
            continue;
        }
        let mut sample = vec![0u8; size as usize];
        r.seek(SeekFrom::Start(offset))?;
        r.read_exact(&mut sample)?;
        let text = match track.format {
            TextFormat::TimedText => timed_text(&sample),
            TextFormat::WebVtt => webvtt_text(&sample)?,
        };
        let start = seconds(time as i128, scale) + track.shift;
        cues.push(PendingCue {
            start: start.max(0.0),
            end: Some(seconds((time + duration as u64) as i128, scale) + track.shift),
            text,
        });
    }
    Ok(EmbeddedTrack {
        id: track.id,
        name: None,
        language: track.language.clone(),
        codec: match track.format {
            TextFormat::TimedText => "TX3G",
            TextFormat::WebVtt => "VTT",
        },
        default: track.enabled,
        forced: false,
        cues: finish_cues(cues),
    })
}

pub fn extract<R: Read + Seek>(
    r: &mut BufReader<R>,
    superseded: &dyn Fn() -> bool,
) -> AppResult<Vec<EmbeddedTrack>> {
    let Some(moov) = read_moov(r)? else {
        return Ok(Vec::new());
    };
    let movie_scale = match find(&moov, &[b"mvhd"])? {
        Some(mvhd) => timescale_and_language(mvhd)?.0,
        None => 1000,
    };
    let mut out = Vec::new();
    for (kind, trak) in boxes(&moov)? {
        if &kind != b"trak" {
            continue;
        }
        let Some(info) = track_info(trak, movie_scale)? else {
            continue;
        };
        let track = read_track(r, &info, superseded)?;
        if !track.cues.is_empty() {
            out.push(track);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn bx(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        [&((body.len() + 8) as u32).to_be_bytes()[..], kind, body].concat()
    }

    /// A full box: version 0, no flags.
    fn full(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        bx(kind, &[&[0u8; 4][..], body].concat())
    }

    fn u32s(values: &[u32]) -> Vec<u8> {
        values.iter().flat_map(|v| v.to_be_bytes()).collect()
    }

    fn tx3g(text: &str) -> Vec<u8> {
        [&(text.len() as u16).to_be_bytes()[..], text.as_bytes()].concat()
    }

    fn packed(code: &str) -> u16 {
        code.bytes()
            .fold(0, |acc, b| (acc << 5) | (b - 0x60) as u16)
    }

    /// A subtitle `trak` whose samples sit at `offsets` (one per chunk).
    fn trak(id: u32, handler: &[u8; 4], format: &[u8; 4], samples: &[(u32, u32, u64)]) -> Vec<u8> {
        let tkhd = bx(
            b"tkhd",
            &[&[0, 0, 0, 1][..], &u32s(&[0, 0, id, 0])[..], &[0u8; 64][..]].concat(),
        );
        let mdhd = full(
            b"mdhd",
            &[
                &u32s(&[0, 0, 1000, 0])[..],
                &packed("vie").to_be_bytes(),
                &[0, 0],
            ]
            .concat(),
        );
        let hdlr = full(b"hdlr", &[&[0u8; 4][..], handler, &[0u8; 13][..]].concat());
        let stsd = full(
            b"stsd",
            &[&u32s(&[1])[..], &bx(format, &[0u8; 8])[..]].concat(),
        );
        let stts_entries: Vec<u32> = samples.iter().flat_map(|&(_, d, _)| [1, d]).collect();
        let stts = full(
            b"stts",
            &[&u32s(&[samples.len() as u32])[..], &u32s(&stts_entries)].concat(),
        );
        let stsc = full(b"stsc", &u32s(&[1, 1, 1, 1]));
        let sizes: Vec<u32> = samples.iter().map(|&(s, _, _)| s).collect();
        let stsz = full(
            b"stsz",
            &[&u32s(&[0, samples.len() as u32])[..], &u32s(&sizes)].concat(),
        );
        let offsets: Vec<u32> = samples.iter().map(|&(_, _, o)| o as u32).collect();
        let stco = full(
            b"stco",
            &[&u32s(&[samples.len() as u32])[..], &u32s(&offsets)].concat(),
        );
        let stbl = bx(b"stbl", &[stsd, stts, stsc, stsz, stco].concat());
        let mdia = bx(b"mdia", &[mdhd, hdlr, bx(b"minf", &stbl)].concat());
        // Starts one second late: an empty edit, then the media from its start.
        let elst = full(
            b"elst",
            &u32s(&[2, 1000, u32::MAX, 0x10000, 4000, 0, 0x10000]),
        );
        bx(b"trak", &[tkhd, bx(b"edts", &elst), mdia].concat())
    }

    #[test]
    fn reads_timed_text_samples_where_the_tables_point() {
        let ftyp = bx(b"ftyp", b"isom\0\0\0\0");
        let samples = [tx3g("Xin chào"), tx3g(""), tx3g("a < b & c")];
        let mdat_body: Vec<u8> = samples.concat();
        let mdat = bx(b"mdat", &mdat_body);
        let mut offset = (ftyp.len() + 8) as u64;
        let mut table = Vec::new();
        for (sample, duration) in samples.iter().zip([1500, 500, 2000]) {
            table.push((sample.len() as u32, duration, offset));
            offset += sample.len() as u64;
        }
        let mvhd = full(
            b"mvhd",
            &[&u32s(&[0, 0, 1000, 0])[..], &[0u8; 80][..]].concat(),
        );
        let video = bx(b"trak", &full(b"tkhd", &[0u8; 80]));
        let moov = bx(
            b"moov",
            &[mvhd, video, trak(2, b"sbtl", b"tx3g", &table)].concat(),
        );
        let file = [ftyp, mdat, moov].concat();

        let found = extract(&mut BufReader::new(Cursor::new(file)), &|| false).unwrap();
        assert_eq!(found.len(), 1);
        let track = &found[0];
        assert_eq!((track.id, track.codec), (2, "TX3G"));
        assert_eq!(track.language.as_deref(), Some("vie"));
        assert!(track.default);
        let cues: Vec<(f64, f64, &str)> = track
            .cues
            .iter()
            .map(|c| (c.start, c.end, c.text.as_str()))
            .collect();
        assert_eq!(
            cues,
            [(1.0, 2.5, "Xin chào"), (3.0, 5.0, "a &lt; b &amp; c")]
        );
    }

    #[test]
    fn reads_webvtt_samples() {
        let cue = bx(b"vttc", &bx(b"payl", "<i>Một</i>".as_bytes()));
        let sample = [cue.clone(), bx(b"vttc", &bx(b"payl", b"hai"))].concat();
        assert_eq!(webvtt_text(&sample).unwrap(), "<i>Một</i>\nhai");
        assert_eq!(webvtt_text(&bx(b"vtte", b"")).unwrap(), "");
    }

    #[test]
    fn decodes_language_codes_and_utf16_timed_text() {
        assert_eq!(language(packed("eng")).as_deref(), Some("eng"));
        assert_eq!(language(packed("und")), None);
        assert_eq!(language(0x7FFF), None);
        assert_eq!(language(80).as_deref(), Some("vie"));
        assert_eq!(language(130).as_deref(), Some("cat"));
        assert_eq!(language(100), None);
        let utf16: Vec<u8> = [&[0x00, 0x06, 0xFE, 0xFF][..], &[0x00, b'H', 0x00, 0xE9]].concat();
        assert_eq!(timed_text(&utf16), "Hé");
    }

    #[test]
    fn a_file_without_moov_has_no_subtitles() {
        let file = [bx(b"ftyp", b"isom"), bx(b"mdat", &[0u8; 32])].concat();
        let found = extract(&mut BufReader::new(Cursor::new(file)), &|| false).unwrap();
        assert!(found.is_empty());
    }
}
