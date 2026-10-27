/**
 * Shared "open something and play it" flows used by shortcuts, pages, drag & drop
 * and OS file events, so they all queue, navigate and report the same way.
 */
import { toast } from "sonner";
import { router } from "@/app/router";
import {
  getMediaInfo,
  onOpenFiles,
  pickFolder,
  pickVideoFiles,
  scanDirectory,
  takePendingMediaFiles,
} from "@/lib/tauri";
import { useSettingsStore } from "@/features/settings/store";
import type { MediaFile } from "@/types/media";
import { usePlaylistStore } from "./store";

/** Replace the queue and switch to the player. Returns false when there is nothing to play. */
export async function playFiles(files: MediaFile[], startIndex = 0): Promise<boolean> {
  if (files.length === 0) return false;
  usePlaylistStore.getState().setQueue(files, startIndex);
  await router.navigate("/player");
  return true;
}

/** Metadata for each path; paths that are gone or aren't videos are skipped. */
export async function mediaInfoFor(paths: string[]): Promise<MediaFile[]> {
  const files = await Promise.all(paths.map((p) => getMediaInfo(p).catch(() => null)));
  return files.filter((f): f is MediaFile => f !== null);
}

/** Toast for a scan that hit the backend's file cap. */
export function warnTruncatedScan() {
  toast.warning("Some folders have too many videos, so only part of them was loaded");
}

/** Video files in each path: folders are scanned (per settings), files are filtered to videos. */
export async function scanPaths(paths: string[]): Promise<MediaFile[]> {
  const recursive = useSettingsStore.getState().scanRecursive;
  const results = await Promise.all(
    paths.map((p) => scanDirectory(p, recursive).catch(() => ({ files: [], truncated: false }))),
  );
  if (results.some((r) => r.truncated)) warnTruncatedScan();
  return results.flatMap((r) => r.files);
}

/** Pick video files with the system dialog and play them. */
export async function openFiles(): Promise<void> {
  const paths = await pickVideoFiles(true);
  if (!paths.length) return;
  if (!(await playFiles(await mediaInfoFor(paths))))
    toast.error("Couldn't open the selected files");
}

/** Pick a folder with the system dialog and play the videos in it. */
export async function openFolder(): Promise<void> {
  const folder = await pickFolder();
  if (!folder) return;
  if (!(await playFiles(await scanPaths([folder])))) toast.error("No videos found in that folder");
}

/** Re-check a remembered file (it may be gone, and needs asset access again) and play it. */
export async function playRecent(file: MediaFile): Promise<void> {
  const fresh = await getMediaInfo(file.path).catch(() => null);
  if (!fresh) {
    toast.error(`${file.name} was moved or deleted`);
    return;
  }
  await playFiles([fresh]);
}

/** Toast for files that arrived from outside the app (startup args, drag & drop). */
export function announceLoaded(count: number) {
  toast.success(`Loaded ${count} file${count > 1 ? "s" : ""}`);
}

async function playOpened(files: MediaFile[]) {
  if (await playFiles(files)) announceLoaded(files.length);
}

/**
 * Play files the OS asks us to open: those that arrived before the app was ready,
 * then any that follow. Subscribes before collecting the early ones so none fall
 * in between. Returns a function that stops listening; a no-op outside Tauri.
 */
export function receiveOpenedFiles(): () => void {
  let stopped = false;
  let unlisten: (() => void) | undefined;
  onOpenFiles((files) => void playOpened(files))
    .then(async (stop) => {
      if (stopped) return stop();
      unlisten = stop;
      const pending = await takePendingMediaFiles();
      if (!stopped) await playOpened(pending);
    })
    .catch(() => {
      /* not in tauri */
    });
  return () => {
    stopped = true;
    unlisten?.();
  };
}
