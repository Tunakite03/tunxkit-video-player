import { describe, expect, it } from "vitest";
import { cuesAt, decodeSubtitleBytes, parseSubtitles, SubtitleParseError } from "./parse";
import { subtitleFormat, subtitleLabel } from "./tracks";

const text = (cue: { lines: { text: string }[][] }) =>
  cue.lines.map((line) => line.map((s) => s.text).join(""));

describe("parseSubtitles", () => {
  it("reads SubRip cues with CRLF line endings and a BOM", () => {
    const srt =
      "\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\nworld\r\n\r\n" +
      "2\r\n01:02:03,040 --> 01:02:04,000\r\nLater\r\n";
    const cues = parseSubtitles(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1, end: 2.5 });
    expect(text(cues[0])).toEqual(["Hello", "world"]);
    expect(cues[1].start).toBeCloseTo(3723.04);
  });

  it("reads WebVTT with short timestamps, cue ids, settings and NOTE blocks", () => {
    const vtt = [
      "WEBVTT - title",
      "",
      "NOTE this is ignored",
      "",
      "intro",
      "00:05.000 --> 00:07.250 align:start line:0",
      "<v Roger>Hi &amp; welcome<00:06.000> there</v>",
      "",
    ].join("\n");
    const [cue] = parseSubtitles(vtt);
    expect(cue).toMatchObject({ start: 5, end: 7.25 });
    expect(text(cue)).toEqual(["Hi & welcome there"]);
  });

  it("keeps italic, bold and underline and strips other markup", () => {
    const [cue] = parseSubtitles(
      '1\n00:00:01,000 --> 00:00:02,000\n{\\an8}<font color="#fff">A <i>b <b>c</b></i> &lt; d</font>\n',
    );
    expect(cue.lines[0]).toEqual([
      { text: "A ", italic: false, bold: false, underline: false },
      { text: "b ", italic: true, bold: false, underline: false },
      { text: "c", italic: true, bold: true, underline: false },
      { text: " < d", italic: false, bold: false, underline: false },
    ]);
  });

  it("splits cues missing the blank line between them and sorts by start", () => {
    const srt =
      "1\n00:00:05,000 --> 00:00:06,000\nSecond\n2\n00:00:01,000 --> 00:00:02,000\nFirst\n";
    expect(parseSubtitles(srt).map((c) => text(c)[0])).toEqual(["First", "Second"]);
  });

  it("drops empty and backwards cues, and fails loudly when nothing is left", () => {
    const srt =
      "1\n00:00:02,000 --> 00:00:01,000\nBackwards\n\n2\n00:00:03,000 --> 00:00:04,000\n<i></i>\n";
    expect(() => parseSubtitles(srt)).toThrow(SubtitleParseError);
    expect(() => parseSubtitles("not a subtitle file")).toThrow(SubtitleParseError);
  });
});

describe("cuesAt", () => {
  const cues = parseSubtitles(
    "1\n00:00:01,000 --> 00:00:05,000\nLong\n\n2\n00:00:02,000 --> 00:00:03,000\nShort\n",
  );

  it("returns every overlapping cue, with the end exclusive", () => {
    expect(cuesAt(cues, 0.5)).toEqual([]);
    expect(cuesAt(cues, 2.5).map((c) => text(c)[0])).toEqual(["Long", "Short"]);
    expect(cuesAt(cues, 3).map((c) => text(c)[0])).toEqual(["Long"]);
    expect(cuesAt(cues, 5)).toEqual([]);
  });
});

describe("decodeSubtitleBytes", () => {
  it("decodes UTF-8, and UTF-16 by its BOM", () => {
    expect(decodeSubtitleBytes(new TextEncoder().encode("Xin chào"))).toBe("Xin chào");
    const le = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0xe9, 0x00]);
    expect(decodeSubtitleBytes(le)).toBe("Hé");
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0xe9]);
    expect(decodeSubtitleBytes(be)).toBe("Hé");
  });

  it("falls back to Windows-1252 for bytes that aren't UTF-8", () => {
    expect(decodeSubtitleBytes(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe("Café");
  });
});

describe("subtitle naming", () => {
  it("labels a track by the language after the video's name", () => {
    expect(subtitleLabel("Movie.en.srt", "movie.mp4")).toBe("English");
    expect(subtitleLabel("movie.vi.vtt", "movie.mp4")).toBe("Vietnamese");
    expect(subtitleLabel("movie.en.forced.srt", "movie.mp4")).toBe("en.forced");
    expect(subtitleLabel("movie.srt", "movie.mp4")).toBe("Default");
    expect(subtitleLabel("other show.srt", "movie.mp4")).toBe("other show");
  });

  it("recognises subtitle files by extension", () => {
    expect(subtitleFormat("C:\\subs\\A.SRT")).toBe("srt");
    expect(subtitleFormat("/subs/a.vtt")).toBe("vtt");
    expect(subtitleFormat("/subs/a.ass")).toBeNull();
    expect(subtitleFormat("/subs/srt")).toBeNull();
  });
});
