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

export interface PlaybackState {
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  buffered: number;
  isFullscreen: boolean;
  isPiP: boolean;
}

export interface Track {
  id: string;
  file: MediaFile;
  /** Cached metadata derived in the renderer (best-effort). */
  durationSec?: number;
  thumbnailDataUrl?: string;
}

export type RepeatMode = "off" | "one" | "all";
