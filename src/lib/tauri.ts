/**
 * Safe wrappers around Tauri APIs. Centralizes invoke calls so feature code stays clean.
 */
import { invoke, convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { EmbeddedSubtitleTrack, MediaFile, ScanResult, SubtitleFile } from "@/types/media";

let videoExtensions: Promise<string[]> | undefined;

/** Containers the system webview can play on this platform, as the backend decides. */
export function getVideoExtensions(): Promise<string[]> {
  videoExtensions ??= invoke<string[]>("get_video_extensions").catch((err: unknown) => {
    videoExtensions = undefined;
    throw err;
  });
  return videoExtensions;
}

// Prevent concurrent native dialog calls (can cause two dialogs to appear simultaneously)
let _dialogOpen = false;

/** Open a system file picker for video files. */
export async function pickVideoFiles(multiple = true): Promise<string[]> {
  if (_dialogOpen) return [];
  _dialogOpen = true;
  try {
    const result = await open({
      multiple,
      directory: false,
      filters: [{ name: "Videos", extensions: await getVideoExtensions() }],
    });
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  } finally {
    _dialogOpen = false;
  }
}

/** Open a system file picker for subtitle files. */
export async function pickSubtitleFiles(): Promise<string[]> {
  if (_dialogOpen) return [];
  _dialogOpen = true;
  try {
    const result = await open({
      multiple: true,
      directory: false,
      filters: [{ name: "Subtitles", extensions: ["srt", "vtt"] }],
    });
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  } finally {
    _dialogOpen = false;
  }
}

/** Open a system folder picker. */
export async function pickFolder(): Promise<string | null> {
  if (_dialogOpen) return null;
  _dialogOpen = true;
  try {
    const result = await open({ directory: true, multiple: false });
    if (!result) return null;
    return Array.isArray(result) ? (result[0] ?? null) : result;
  } finally {
    _dialogOpen = false;
  }
}

/** Scan a directory for supported video files; the backend caps how many it returns. */
export function scanDirectory(path: string, recursive = true): Promise<ScanResult> {
  return invoke<ScanResult>("scan_directory", { path, recursive });
}

/** Fetch lightweight metadata for a single file. */
export function getMediaInfo(path: string): Promise<MediaFile> {
  return invoke<MediaFile>("get_media_info", { path });
}

/** Subtitle files beside a video that share its name (`movie.srt`, `movie.en.vtt`, …). */
export function findSubtitleFiles(videoPath: string): Promise<SubtitleFile[]> {
  return invoke<SubtitleFile[]>("find_subtitle_files", { videoPath });
}

/** Raw bytes of a `.srt` / `.vtt` file; the backend refuses other files and huge ones. */
export async function readSubtitleFile(path: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>("read_subtitle_file", { path }));
}

/**
 * Text subtitle streams inside a video (MKV/WebM, MP4/MOV). Null when a newer call
 * replaced this one before it finished: only the latest extraction keeps running.
 */
export function extractEmbeddedSubtitles(
  videoPath: string,
): Promise<EmbeddedSubtitleTrack[] | null> {
  return invoke<EmbeddedSubtitleTrack[] | null>("extract_embedded_subtitles", { videoPath });
}

/**
 * Media files the OS asked us to open (launch arguments, Open With) before the
 * frontend was listening. Call after `onOpenFiles` has subscribed: from then on
 * the backend sends new files as events instead of holding them.
 */
export function takePendingMediaFiles(): Promise<MediaFile[]> {
  return invoke<MediaFile[]>("take_pending_media_files");
}

/** Subscribe to media files the OS asks us to open while the app is running. */
export function onOpenFiles(handler: (files: MediaFile[]) => void): Promise<UnlistenFn> {
  return listen<MediaFile[]>("open-files", (event) => handler(event.payload ?? []));
}

/** Reveal a path in the OS file explorer. */
export function showInFolder(path: string): Promise<void> {
  return revealItemInDir(path);
}

/**
 * Convert a local filesystem path to a URL the webview can stream. The backend's
 * `media://` protocol only serves files it has returned from a media command.
 */
export function toMediaSrc(path: string): string {
  return tauriConvertFileSrc(path, "media");
}
