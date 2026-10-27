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

export interface Track {
  id: string;
  file: MediaFile;
}

export type RepeatMode = "off" | "one" | "all";
