/**
 * SubRip (.srt) and WebVTT (.vtt) parsing. Both are blocks of a timing line
 * (`00:01:02,500 --> 00:01:04,000`) followed by text lines, so one tolerant reader
 * handles them; formatting is reduced to italic / bold / underline.
 */

export interface CueSegment {
  text: string;
  italic: boolean;
  bold: boolean;
  underline: boolean;
}

/** One rendered line of a cue: consecutive runs of equally styled text. */
export type CueLine = CueSegment[];

export interface SubtitleCue {
  /** Seconds. */
  start: number;
  /** Seconds, exclusive. */
  end: number;
  lines: CueLine[];
}

export class SubtitleParseError extends Error {
  override name = "SubtitleParseError";
}

const TIMESTAMP = String.raw`(?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3}`;
/** VTT puts cue settings after the end time, so only the start of the line is matched. */
const TIMING = new RegExp(String.raw`^\s*(${TIMESTAMP})\s*-->\s*(${TIMESTAMP})`);
/**
 * Markup inside cue text: HTML-like tags (`<i>`, `<font color=…>`, `<c.yellow>`,
 * `<v Speaker>`), VTT karaoke timestamps (`<00:00:01.000>`) and ASS override
 * blocks some .srt files carry (`{\an8}`). A bare `<` in dialogue is left alone.
 */
const MARKUP = /<(\/?)([a-z][a-z0-9]*)(?:[.\s][^<>]*)?>|<\d[\d:.]*>|\{\\[^}]*\}/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lrm: "‎",
  rlm: "‏",
};

function parseTimestamp(raw: string): number {
  const parts = raw.replace(",", ".").split(":");
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length > 0 ? Number(parts.pop()) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

function parseLine(raw: string): CueLine {
  const segments: CueSegment[] = [];
  const depth = { i: 0, b: 0, u: 0 };
  const push = (chunk: string) => {
    const text = decodeEntities(chunk);
    if (!text) return;
    const style = { italic: depth.i > 0, bold: depth.b > 0, underline: depth.u > 0 };
    const prev = segments[segments.length - 1];
    if (
      prev &&
      prev.italic === style.italic &&
      prev.bold === style.bold &&
      prev.underline === style.underline
    ) {
      segments[segments.length - 1] = { ...prev, text: prev.text + text };
    } else {
      segments.push({ text, ...style });
    }
  };
  let last = 0;
  for (const match of raw.matchAll(MARKUP)) {
    push(raw.slice(last, match.index));
    last = match.index + match[0].length;
    const tag = match[2]?.toLowerCase();
    if (tag === "i" || tag === "b" || tag === "u") {
      depth[tag] = Math.max(0, depth[tag] + (match[1] ? -1 : 1));
    }
  }
  push(raw.slice(last));
  return segments.some((s) => s.text.trim()) ? segments : [];
}

/** Lines of one cue's text, with its markup reduced to italic / bold / underline. */
export function parseCueText(text: string): CueLine[] {
  return text
    .split(/\r\n|\r|\n/)
    .map(parseLine)
    .filter((line) => line.length > 0);
}

function toCue(start: number, end: number, text: string[]): SubtitleCue | null {
  if (!(end > start)) return null;
  const lines = parseCueText(text.join("\n"));
  return lines.length > 0 ? { start, end, lines } : null;
}

/**
 * Cues in `source`, sorted by start time. Cues without text or with an end before
 * their start are dropped. Throws `SubtitleParseError` when nothing usable is found.
 */
export function parseSubtitles(source: string): SubtitleCue[] {
  const lines = source.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const cues: SubtitleCue[] = [];
  let current: { start: number; end: number; text: string[] } | null = null;
  const flush = () => {
    const cue = current && toCue(current.start, current.end, current.text);
    if (cue) cues.push(cue);
    current = null;
  };

  for (const line of lines) {
    const timing = TIMING.exec(line);
    if (timing) {
      // A cue that runs straight into the next one, without the blank line between,
      // has picked up the next cue's SRT index as its last text line.
      if (current && /^\s*\d+\s*$/.test(current.text[current.text.length - 1] ?? "")) {
        current.text.pop();
      }
      flush();
      current = { start: parseTimestamp(timing[1]), end: parseTimestamp(timing[2]), text: [] };
    } else if (!line.trim()) {
      flush();
    } else if (current) {
      current.text.push(line);
    }
  }
  flush();

  if (cues.length === 0) throw new SubtitleParseError("No subtitle cues found");
  return cues.sort((a, b) => a.start - b.start);
}

/** Legacy encodings older subtitle files use, by their WHATWG Encoding labels. */
export const SUBTITLE_ENCODINGS = [
  { id: "windows-1252", label: "Western (Windows-1252)" },
  { id: "windows-1258", label: "Vietnamese (Windows-1258)" },
  { id: "windows-1250", label: "Central European (Windows-1250)" },
  { id: "windows-1251", label: "Cyrillic (Windows-1251)" },
  { id: "windows-1253", label: "Greek (Windows-1253)" },
  { id: "windows-1254", label: "Turkish (Windows-1254)" },
  { id: "windows-1255", label: "Hebrew (Windows-1255)" },
  { id: "windows-1256", label: "Arabic (Windows-1256)" },
  { id: "windows-874", label: "Thai (Windows-874)" },
  { id: "gbk", label: "Chinese, Simplified (GBK)" },
  { id: "big5", label: "Chinese, Traditional (Big5)" },
  { id: "shift_jis", label: "Japanese (Shift_JIS)" },
  { id: "euc-kr", label: "Korean (EUC-KR)" },
] as const;

export type SubtitleEncoding = (typeof SUBTITLE_ENCODINGS)[number]["id"];

export function isSubtitleEncoding(value: unknown): value is SubtitleEncoding {
  return SUBTITLE_ENCODINGS.some((e) => e.id === value);
}

/** Primary language subtag → the legacy encoding its old files most likely use. */
const LANGUAGE_ENCODINGS: Record<string, SubtitleEncoding> = {
  vi: "windows-1258",
  cs: "windows-1250",
  hr: "windows-1250",
  hu: "windows-1250",
  pl: "windows-1250",
  ro: "windows-1250",
  sk: "windows-1250",
  sl: "windows-1250",
  bg: "windows-1251",
  mk: "windows-1251",
  ru: "windows-1251",
  sr: "windows-1251",
  uk: "windows-1251",
  el: "windows-1253",
  tr: "windows-1254",
  he: "windows-1255",
  ar: "windows-1256",
  fa: "windows-1256",
  th: "windows-874",
  ja: "shift_jis",
  ko: "euc-kr",
};

/** The fallback encoding to start with for a UI in `language` (a BCP 47 tag). */
export function defaultSubtitleEncoding(language: string): SubtitleEncoding {
  const [primary = "", region = ""] = language.toLowerCase().split("-");
  if (primary === "zh") {
    return ["tw", "hk", "mo", "hant"].includes(region) ? "big5" : "gbk";
  }
  return LANGUAGE_ENCODINGS[primary] ?? "windows-1252";
}

/**
 * Text of a subtitle file. A BOM decides; otherwise UTF-8 when the bytes are valid
 * UTF-8, else `fallback`. The result is NFC-normalized: Windows-1258 stores Vietnamese
 * tone marks as separate combining characters.
 */
export function decodeSubtitleBytes(bytes: Uint8Array, fallback: SubtitleEncoding): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    return new TextDecoder(fallback).decode(bytes).normalize("NFC");
  }
}

/** The cues showing at `time` seconds; `cues` must be sorted by start. */
export function cuesAt(cues: readonly SubtitleCue[], time: number): SubtitleCue[] {
  const active: SubtitleCue[] = [];
  for (const cue of cues) {
    if (cue.start > time) break;
    if (time < cue.end) active.push(cue);
  }
  return active;
}
