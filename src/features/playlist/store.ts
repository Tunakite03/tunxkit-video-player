import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { MediaFile, RepeatMode, Track } from "@/types/media";

function makeTrack(file: MediaFile): Track {
  return { id: `${file.path}`, file };
}

/** Cap on remembered steps for "previous". */
const MAX_HISTORY = 200;

/** Drop repeated paths — track ids are paths and must stay unique. */
function uniqueByPath(files: MediaFile[]): MediaFile[] {
  const seen = new Set<string>();
  return files.filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true)));
}

interface PlaylistState {
  tracks: Track[];
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** History of recently played file paths (most recent first). */
  recent: MediaFile[];
  /** Ids of tracks left by `next`/`jumpTo`, most recent last, so "previous" can retrace a shuffle. */
  history: string[];
  /** Ids already played in the current shuffle cycle, including the current track. */
  shuffleSeen: string[];

  setQueue: (files: MediaFile[], startIndex?: number) => void;
  removeAt: (index: number) => void;
  clear: () => void;
  next: () => Track | undefined;
  prev: () => Track | undefined;
  jumpTo: (index: number) => Track | undefined;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  pushRecent: (file: MediaFile) => void;
}

const REPEAT_ORDER: RepeatMode[] = ["off", "all", "one"];

const clampIndex = (index: number, length: number) =>
  Math.max(0, Math.min(length - 1, Number.isFinite(index) ? index : 0));

function pushHistory(history: string[], id: string) {
  history.push(id);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    immer((set, get) => ({
      tracks: [],
      currentIndex: -1,
      shuffle: false,
      repeat: "off",
      recent: [],
      history: [],
      shuffleSeen: [],

      setQueue: (files, startIndex = 0) =>
        set((s) => {
          const unique = uniqueByPath(files);
          const startPath =
            files.length > 0 ? files[clampIndex(startIndex, files.length)].path : undefined;
          s.tracks = unique.map(makeTrack);
          s.currentIndex =
            startPath !== undefined ? unique.findIndex((f) => f.path === startPath) : -1;
          s.history = [];
          s.shuffleSeen = startPath !== undefined ? [startPath] : [];
        }),

      removeAt: (index) =>
        set((s) => {
          if (index < 0 || index >= s.tracks.length) return;
          const [removed] = s.tracks.splice(index, 1);
          s.history = s.history.filter((id) => id !== removed.id);
          s.shuffleSeen = s.shuffleSeen.filter((id) => id !== removed.id);
          if (s.currentIndex === index) {
            s.currentIndex = Math.min(index, s.tracks.length - 1);
          } else if (s.currentIndex > index) {
            s.currentIndex -= 1;
          }
        }),

      clear: () =>
        set((s) => {
          s.tracks = [];
          s.currentIndex = -1;
          s.history = [];
          s.shuffleSeen = [];
        }),

      next: () => {
        const { tracks, currentIndex, shuffle, repeat, shuffleSeen } = get();
        if (tracks.length === 0) return undefined;
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        // Called for an explicit "next": "repeat one" (handled by the player when a
        // video ends) wraps around like "repeat all" instead of being stuck.
        let nextIdx: number;
        let seen = shuffleSeen;
        if (shuffle) {
          // Each track plays once per cycle; with repeat off the queue ends after a cycle.
          const currentId = tracks[safeIndex].id;
          const seenSet = new Set([...seen, currentId]);
          let candidates = tracks.flatMap((t, i) => (seenSet.has(t.id) ? [] : [i]));
          if (candidates.length === 0) {
            if (repeat === "off") return undefined;
            seen = [currentId];
            candidates =
              tracks.length === 1 ? [0] : tracks.flatMap((_, i) => (i === safeIndex ? [] : [i]));
          } else {
            seen = [...seenSet];
          }
          nextIdx = candidates[Math.floor(Math.random() * candidates.length)];
        } else {
          nextIdx = safeIndex + 1;
          if (nextIdx >= tracks.length) {
            if (repeat !== "off") nextIdx = 0;
            else return undefined;
          }
        }
        set((s) => {
          if (currentIndex >= 0) pushHistory(s.history, tracks[currentIndex].id);
          s.currentIndex = nextIdx;
          if (shuffle) s.shuffleSeen = [...seen, tracks[nextIdx].id];
        });
        return tracks[nextIdx];
      },

      prev: () => {
        const { tracks, currentIndex, repeat, shuffle, history } = get();
        if (tracks.length === 0) return undefined;
        if (shuffle && history.length > 0) {
          const back = tracks.findIndex((t) => t.id === history[history.length - 1]);
          set((s) => {
            s.history.pop();
            s.currentIndex = back;
          });
          return tracks[back];
        }
        let idx = (currentIndex >= 0 ? currentIndex : 0) - 1;
        if (idx < 0) idx = repeat !== "off" ? tracks.length - 1 : 0;
        set((s) => {
          s.currentIndex = idx;
        });
        return tracks[idx];
      },

      jumpTo: (index) => {
        const { tracks } = get();
        if (index < 0 || index >= tracks.length) return undefined;
        set((s) => {
          if (s.currentIndex >= 0 && s.currentIndex !== index)
            pushHistory(s.history, tracks[s.currentIndex].id);
          s.currentIndex = index;
          if (!s.shuffleSeen.includes(tracks[index].id)) s.shuffleSeen.push(tracks[index].id);
        });
        return tracks[index];
      },

      toggleShuffle: () =>
        set((s) => {
          s.shuffle = !s.shuffle;
          const current = s.currentIndex >= 0 ? s.tracks[s.currentIndex] : undefined;
          s.shuffleSeen = current ? [current.id] : [];
        }),

      cycleRepeat: () =>
        set((s) => {
          const idx = REPEAT_ORDER.indexOf(s.repeat);
          s.repeat = REPEAT_ORDER[(idx + 1) % REPEAT_ORDER.length];
        }),

      pushRecent: (file) =>
        set((s) => {
          s.recent = [file, ...s.recent.filter((r) => r.path !== file.path)].slice(0, 30);
        }),
    })),
    {
      name: "tunxkit.playlist",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        recent: s.recent,
        shuffle: s.shuffle,
        repeat: s.repeat,
      }),
    },
  ),
);

/** Selector: the currently active track (or undefined). */
export const selectCurrentTrack = (s: PlaylistState): Track | undefined =>
  s.currentIndex >= 0 ? s.tracks[s.currentIndex] : undefined;
