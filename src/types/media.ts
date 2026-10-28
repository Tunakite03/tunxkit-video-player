/**
 * Domain types shared across the frontend.
 */

export interface MediaFile {
  /** Absolute filesystem path. */
  path: string;
  /** Filename only. */
  name: string;
  /** Bytes. */
  size: number;
  /** Lower-case extension (no dot). */
  extension: string;
  /** Last modified unix time (seconds). */
  modified?: number;
}

export interface ScanResult {
  files: MediaFile[];
  /** The backend stopped at its file cap, so some videos were left out. */
  truncated: boolean;
}

/** A subtitle file on disk (`.srt` / `.vtt`). */
export interface SubtitleFile {
  /** Absolute filesystem path. */
  path: string;
  /** Filename only. */
  name: string;
}

/** One cue of a subtitle stream inside a video; `text` uses SRT-style markup. */
export interface EmbeddedSubtitleCue {
  /** Seconds. */
  start: number;
  /** Seconds. */
  end: number;
  text: string;
}

/** A text subtitle stream the backend read out of a video container. */
export interface EmbeddedSubtitleTrack {
  /** Track number / ID, unique within the file. */
  id: number;
  name: string | null;
  /** ISO 639-2 or BCP 47 code. */
  language: string | null;
  /** Short codec tag for display: "SRT", "ASS", "SSA", "VTT", "TX3G". */
  codec: string;
  default: boolean;
  forced: boolean;
  cues: EmbeddedSubtitleCue[];
}

export interface Track {
  id: string;
  file: MediaFile;
}

export type RepeatMode = "off" | "one" | "all";
