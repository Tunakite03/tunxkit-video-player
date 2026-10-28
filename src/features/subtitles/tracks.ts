/**
 * Naming of subtitle files: which paths are subtitles, and the label a track gets
 * in the menu (`movie.vi.srt` next to `movie.mp4` → "Vietnamese").
 */

export const SUBTITLE_EXTENSIONS = ["srt", "vtt"] as const;

export type SubtitleFormat = (typeof SUBTITLE_EXTENSIONS)[number];

/** File name of a path with either separator. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function splitExtension(name: string): [stem: string, extension: string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot + 1).toLowerCase()] : [name, ""];
}

/** The subtitle format of a file name or path, or null when it isn't one. */
export function subtitleFormat(path: string): SubtitleFormat | null {
  const [, extension] = splitExtension(baseName(path));
  return (SUBTITLE_EXTENSIONS as readonly string[]).includes(extension)
    ? (extension as SubtitleFormat)
    : null;
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });

/** "English" for "en" or "eng"; the tag itself when it isn't a known language. */
export function languageName(tag: string): string {
  try {
    return languageNames.of(tag) ?? tag;
  } catch (err) {
    // Tags such as "en.forced" aren't valid BCP 47 and make `of` throw.
    if (err instanceof RangeError) return tag;
    throw err;
  }
}

/**
 * Menu label for subtitle file `subtitleName` shown with video `videoName`:
 * the language after the video's name (`movie.en.srt` → "English"), "Default" for
 * an exact name match (`movie.srt`), otherwise the subtitle's own name.
 */
export function subtitleLabel(subtitleName: string, videoName: string): string {
  const [stem] = splitExtension(subtitleName);
  const [videoStem] = splitExtension(videoName);
  const lowerStem = stem.toLowerCase();
  const lowerVideoStem = videoStem.toLowerCase();
  if (lowerStem === lowerVideoStem) return "Default";
  if (lowerStem.startsWith(`${lowerVideoStem}.`)) {
    return languageName(stem.slice(videoStem.length + 1));
  }
  return stem;
}
