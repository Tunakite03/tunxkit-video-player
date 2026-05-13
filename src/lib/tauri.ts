/**
 * Safe wrappers around Tauri APIs. Centralizes invoke calls so feature code stays clean.
 */
import {
  invoke,
  convertFileSrc as tauriConvertFileSrc,
} from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { MediaFile } from "@/types/media";

export const VIDEO_EXTENSIONS = [
  "mp4",
  "mkv",
  "webm",
  "mov",
  "avi",
  "wmv",
  "flv",
  "m4v",
  "ts",
  "mpg",
  "mpeg",
  "3gp",
  "ogv",
];

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
      filters: [{ name: "Videos", extensions: VIDEO_EXTENSIONS }],
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

/** Recursively scan a directory for supported video files. */
export function scanDirectory(
  path: string,
  recursive = true,
): Promise<MediaFile[]> {
  return invoke<MediaFile[]>("scan_directory", { path, recursive });
}

/** Fetch lightweight metadata for a single file. */
export function getMediaInfo(path: string): Promise<MediaFile> {
  return invoke<MediaFile>("get_media_info", { path });
}

/** Reveal a path in the OS file explorer. */
export function showInFolder(path: string): Promise<void> {
  return invoke<void>("show_in_folder", { path });
}

/** Convert a local filesystem path to a URL the webview can stream. */
export function toMediaSrc(path: string): string {
  return tauriConvertFileSrc(path);
}

/** Detect if we are running inside Tauri. */
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
