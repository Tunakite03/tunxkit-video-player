/**
 * Loading subtitle tracks for the current video: the files beside it, the text
 * streams inside it, files picked in the system dialog, and files dropped on the window.
 */
import { toast } from "sonner";
import {
  extractEmbeddedSubtitles,
  findSubtitleFiles,
  pickSubtitleFiles,
  readSubtitleFile,
} from "@/lib/tauri";
import { usePlaylistStore, selectCurrentTrack } from "@/features/playlist/store";
import type { EmbeddedSubtitleTrack, MediaFile, SubtitleFile } from "@/types/media";
import { decodeSubtitleBytes, parseCueText, parseSubtitles, type SubtitleCue } from "./parse";
import { baseName, languageName, subtitleFormat, subtitleLabel } from "./tracks";
import { useSubtitleStore, type CueListTrack } from "./store";

async function readTrack(file: SubtitleFile, video: MediaFile): Promise<CueListTrack> {
  const format = subtitleFormat(file.name);
  if (!format) throw new Error(`Not a subtitle file: ${file.name}`);
  const cues = parseSubtitles(decodeSubtitleBytes(await readSubtitleFile(file.path)));
  return {
    id: file.path,
    source: "file",
    label: subtitleLabel(file.name, video.name),
    hint: format.toUpperCase(),
    cues,
  };
}

/** Read every file; the ones that fail are reported and left out. */
async function readTracks(files: SubtitleFile[], video: MediaFile): Promise<CueListTrack[]> {
  const results = await Promise.allSettled(files.map((f) => readTrack(f, video)));
  const tracks: CueListTrack[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      tracks.push(result.value);
      return;
    }
    console.warn("subtitle file could not be loaded", {
      path: files[i].path,
      error: result.reason,
    });
    toast.error(`Couldn't load subtitles from ${files[i].name}`);
  });
  return tracks;
}

/**
 * Load the subtitle files beside `video`. Call after `useSubtitleStore.resetFor(video.path)`;
 * results for a video that is no longer current are dropped by the store.
 */
export async function loadSidecarSubtitles(video: MediaFile): Promise<void> {
  const tracks = await readTracks(await findSubtitleFiles(video.path), video);
  useSubtitleStore.getState().addTracks(video.path, tracks);
}

function embeddedLabel(track: EmbeddedSubtitleTrack): string {
  const base = track.name || (track.language ? languageName(track.language) : `Track ${track.id}`);
  return track.forced ? `${base} (forced)` : base;
}

/** A backend track as a cue list; null when none of its cues has text. */
export function toEmbeddedTrack(track: EmbeddedSubtitleTrack): CueListTrack | null {
  const cues: SubtitleCue[] = [];
  for (const cue of track.cues) {
    const lines = parseCueText(cue.text);
    if (lines.length > 0 && cue.end > cue.start)
      cues.push({ start: cue.start, end: cue.end, lines });
  }
  if (cues.length === 0) return null;
  cues.sort((a, b) => a.start - b.start);
  return {
    id: `embedded:${track.id}`,
    source: "embedded",
    label: embeddedLabel(track),
    hint: track.codec,
    cues,
  };
}

/**
 * Load the text subtitle streams inside `video`, read by the backend. Call after
 * `useSubtitleStore.resetFor(video.path)`.
 */
export async function loadEmbeddedSubtitles(video: MediaFile): Promise<void> {
  const extracted = await extractEmbeddedSubtitles(video.path);
  // A newer video's extraction took over; its own call reports the tracks.
  if (extracted === null) return;
  const tracks = extracted.map(toEmbeddedTrack).filter((t): t is CueListTrack => t !== null);
  useSubtitleStore.getState().addTracks(video.path, tracks);
}

/** Load subtitle files at `paths` for `video` and show the first that loads. */
export async function loadSubtitlePaths(video: MediaFile, paths: string[]): Promise<void> {
  const files = paths.map((path) => ({ path, name: baseName(path) }));
  const tracks = await readTracks(files, video);
  if (tracks.length === 0) return;
  const store = useSubtitleStore.getState();
  store.addTracks(video.path, tracks);
  store.select(tracks[0].id);
  toast.success(`Loaded ${tracks.length} subtitle file${tracks.length > 1 ? "s" : ""}`);
}

/** Pick subtitle files with the system dialog for the video that is playing. */
export async function openSubtitleFiles(): Promise<void> {
  const video = selectCurrentTrack(usePlaylistStore.getState())?.file;
  if (!video) return;
  const paths = await pickSubtitleFiles();
  if (paths.length > 0) await loadSubtitlePaths(video, paths);
}
