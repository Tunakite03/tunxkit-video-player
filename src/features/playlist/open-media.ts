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
import { baseName } from "@/features/subtitles/tracks";
import type { MediaFile } from "@/types/media";
import { usePlaylistStore } from "./store";

/** Replace the queue and switch to the player. Returns false when there is nothing to play. */
export async function playFiles(files: MediaFile[], startIndex = 0): Promise<boolean> {
  if (files.length === 0) return false;
  usePlaylistStore.getState().setQueue(files, startIndex);
  await router.navigate("/player");
  return true;
}

/** Videos found for a set of paths, and the paths that couldn't be read at all. */
export interface Found {
  files: MediaFile[];
  failed: { path: string; error: unknown }[];
}

/** Results of `read` on each path, split into what it returned and the paths it failed on. */
async function readEach<T>(
  paths: string[],
  read: (path: string) => Promise<T>,
): Promise<{ results: T[]; failed: Found["failed"] }> {
  const settled = await Promise.allSettled(paths.map(read));
  const results: T[] = [];
  const failed: Found["failed"] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") results.push(r.value);
    else failed.push({ path: paths[i], error: r.reason });
  });
  return { results, failed };
}

/** Metadata for each path; paths that are gone or aren't videos are listed as failed. */
export async function mediaInfoFor(paths: string[]): Promise<Found> {
  const { results, failed } = await readEach(paths, getMediaInfo);
  return { files: results, failed };
}

/** Toast for a scan that hit the backend's file cap. */
export function warnTruncatedScan() {
  toast.warning("Some folders have too many videos, so only part of them was loaded");
}

/**
 * Video files in each path: folders are scanned (per settings), files are filtered to
 * videos. Paths that can't be read (gone, no permission) are listed as failed.
 */
export async function scanPaths(paths: string[]): Promise<Found> {
  const recursive = useSettingsStore.getState().scanRecursive;
  const { results, failed } = await readEach(paths, (p) => scanDirectory(p, recursive));
  if (results.some((r) => r.truncated)) warnTruncatedScan();
  return { files: results.flatMap((r) => r.files), failed };
}

/** "a.mp4", or "3 items: a.mp4, b.mp4, c.mp4", naming at most three. */
function describeItems(paths: string[]): string {
  const names = paths.map(baseName);
  if (names.length === 1) return names[0];
  const shown = names.slice(0, 3).join(", ");
  return `${names.length} items: ${shown}${names.length > 3 ? ", …" : ""}`;
}

/**
 * Play what was found and report what couldn't be read; `nothingFound` is the error
 * when every path was read but held no video. Returns whether anything plays.
 */
export async function playFound({ files, failed }: Found, nothingFound: string): Promise<boolean> {
  if (failed.length > 0) console.warn("items could not be opened", { items: failed });
  const unread =
    failed.length > 0 ? `Couldn't open ${describeItems(failed.map((f) => f.path))}` : null;
  if (!(await playFiles(files))) {
    toast.error(unread ?? nothingFound);
    return false;
  }
  if (unread) toast.warning(unread);
  return true;
}

/** Pick video files with the system dialog and play them. */
export async function openFiles(): Promise<void> {
  const paths = await pickVideoFiles(true);
  if (!paths.length) return;
  await playFound(await mediaInfoFor(paths), "Couldn't open the selected files");
}

/** Pick a folder with the system dialog and play the videos in it. */
export async function openFolder(): Promise<void> {
  const folder = await pickFolder();
  if (!folder) return;
  await playFound(await scanPaths([folder]), "No videos found in that folder");
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
