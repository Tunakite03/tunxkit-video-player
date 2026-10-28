import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { useSettingsStore } from "@/features/settings/store";
import type { SubtitleCue } from "./parse";

interface TrackBase {
  id: string;
  label: string;
  /** Short format tag shown beside the label ("SRT", "ASS", "CC"…). */
  hint: string;
}

/**
 * A track whose cues are all known up front: a subtitle file (`file`), or a text
 * stream the backend read out of the video container (`embedded`).
 */
export interface CueListTrack extends TrackBase {
  source: "file" | "embedded";
  cues: SubtitleCue[];
}

/** A text track the webview demuxes itself; its cues arrive while the video plays. */
export interface InbandTrack extends TrackBase {
  source: "inband";
  textTrack: TextTrack;
}

export type SubtitleTrack = CueListTrack | InbandTrack;

/**
 * Which track shows on its own: a file beside the video, then what the backend read
 * from the container, then the webview's tracks. Lower wins.
 */
const AUTO_PRIORITY: Record<SubtitleTrack["source"], number> = { file: 0, embedded: 1, inband: 2 };

interface SubtitleState {
  /** Video the tracks belong to. Tracks loaded for any other video are dropped. */
  videoPath: string | null;
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  /** Track last shown for this video, so toggling captions back on restores it. */
  lastTrackId: string | null;
  /** The user picked a track (or Off) for this video, so new tracks don't take over. */
  userChose: boolean;

  /** Forget every track and start collecting them for `videoPath`. */
  resetFor: (videoPath: string | null) => void;
  /**
   * Add tracks for `videoPath`, replacing any with the same id. Container tracks the
   * backend read replace the webview's copies of them. Until the user picks a track,
   * the best one shows when subtitles are on.
   */
  addTracks: (videoPath: string, tracks: SubtitleTrack[]) => void;
  removeTrack: (id: string) => void;
  /** Show a track, or none with null. Remembered as the subtitles on/off preference. */
  select: (id: string | null) => void;
  /** Hide the shown track, or show the last one (else the first). False when there are none. */
  toggle: () => boolean;
}

type Draft = Pick<SubtitleState, "tracks" | "activeTrackId" | "lastTrackId" | "userChose">;

function autoSelect(s: Draft) {
  if (s.userChose) return;
  if (!useSettingsStore.getState().subtitlesEnabled) {
    s.activeTrackId = null;
    return;
  }
  let best: SubtitleTrack | null = null;
  for (const track of s.tracks) {
    if (!best || AUTO_PRIORITY[track.source] < AUTO_PRIORITY[best.source]) best = track;
  }
  s.activeTrackId = best?.id ?? null;
  if (best) s.lastTrackId = best.id;
}

/** Subtitles of the current video. Not persisted: tracks are re-read for each video. */
export const useSubtitleStore = create<SubtitleState>()(
  immer((set, get) => ({
    videoPath: null,
    tracks: [],
    activeTrackId: null,
    lastTrackId: null,
    userChose: false,

    resetFor: (videoPath) =>
      set((s) => {
        s.videoPath = videoPath;
        s.tracks = [];
        s.activeTrackId = null;
        s.lastTrackId = null;
        s.userChose = false;
      }),
    addTracks: (videoPath, tracks) =>
      set((s) => {
        if (s.videoPath !== videoPath) return;
        const hasEmbedded = (list: SubtitleTrack[]) => list.some((t) => t.source === "embedded");
        if (hasEmbedded(tracks)) {
          s.tracks = s.tracks.filter((t) => t.source !== "inband");
          if (!s.tracks.some((t) => t.id === s.activeTrackId)) {
            // The shown webview track now comes from the backend's copy instead.
            s.activeTrackId = null;
            s.userChose = false;
          }
        }
        const skipInband = hasEmbedded(s.tracks) || hasEmbedded(tracks);
        for (const track of tracks) {
          if (skipInband && track.source === "inband") continue;
          const index = s.tracks.findIndex((t) => t.id === track.id);
          if (index >= 0) s.tracks[index] = track;
          else s.tracks.push(track);
        }
        autoSelect(s);
      }),
    removeTrack: (id) =>
      set((s) => {
        s.tracks = s.tracks.filter((t) => t.id !== id);
        if (s.activeTrackId === id) {
          s.activeTrackId = null;
          s.userChose = false;
        }
        autoSelect(s);
      }),
    select: (id) => {
      if (id !== null && !get().tracks.some((t) => t.id === id)) return;
      set((s) => {
        s.activeTrackId = id;
        s.userChose = true;
        if (id !== null) s.lastTrackId = id;
      });
      useSettingsStore.getState().set("subtitlesEnabled", id !== null);
    },
    toggle: () => {
      const { activeTrackId, lastTrackId, tracks, select } = get();
      if (activeTrackId !== null) {
        select(null);
        return true;
      }
      const target = tracks.find((t) => t.id === lastTrackId) ?? tracks[0];
      if (!target) return false;
      select(target.id);
      return true;
    },
  })),
);

export const selectActiveTrack = (s: SubtitleState): SubtitleTrack | null =>
  s.tracks.find((t) => t.id === s.activeTrackId) ?? null;
