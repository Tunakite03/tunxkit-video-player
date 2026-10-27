import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { MediaFile, RepeatMode, Track } from "@/types/media";

function makeTrack(file: MediaFile): Track {
  return { id: `${file.path}`, file };
}

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

  setQueue: (files: MediaFile[], startIndex?: number) => void;
  enqueue: (files: MediaFile[]) => void;
  playFile: (file: MediaFile) => void;
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

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    immer((set, get) => ({
      tracks: [],
      currentIndex: -1,
      shuffle: false,
      repeat: "off",
      recent: [],

      setQueue: (files, startIndex = 0) =>
        set((s) => {
          const unique = uniqueByPath(files);
          const startPath =
            files.length > 0 ? files[clampIndex(startIndex, files.length)].path : undefined;
          s.tracks = unique.map(makeTrack);
          s.currentIndex =
            startPath !== undefined
              ? unique.findIndex((f) => f.path === startPath)
              : -1;
        }),

      enqueue: (files) =>
        set((s) => {
          const known = new Set(s.tracks.map((t) => t.file.path));
          const fresh = uniqueByPath(files).filter((f) => !known.has(f.path));
          s.tracks.push(...fresh.map(makeTrack));
          if (s.currentIndex < 0 && s.tracks.length > 0) s.currentIndex = 0;
        }),

      playFile: (file) =>
        set((s) => {
          const existing = s.tracks.findIndex((t) => t.file.path === file.path);
          if (existing >= 0) {
            s.currentIndex = existing;
          } else {
            s.tracks.push(makeTrack(file));
            s.currentIndex = s.tracks.length - 1;
          }
        }),

      removeAt: (index) =>
        set((s) => {
          if (index < 0 || index >= s.tracks.length) return;
          s.tracks.splice(index, 1);
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
        }),

      next: () => {
        const { tracks, currentIndex, shuffle, repeat } = get();
        if (tracks.length === 0) return undefined;
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        // Called for an explicit "next": "repeat one" (handled by the player when a
        // video ends) wraps around like "repeat all" instead of being stuck.
        let nextIdx: number;
        if (shuffle) {
          if (tracks.length === 1) nextIdx = 0;
          else {
            do {
              nextIdx = Math.floor(Math.random() * tracks.length);
            } while (nextIdx === safeIndex);
          }
        } else {
          nextIdx = safeIndex + 1;
          if (nextIdx >= tracks.length) {
            if (repeat !== "off") nextIdx = 0;
            else return undefined;
          }
        }
        set((s) => {
          s.currentIndex = nextIdx;
        });
        return tracks[nextIdx];
      },

      prev: () => {
        const { tracks, currentIndex, repeat } = get();
        if (tracks.length === 0) return undefined;
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
          s.currentIndex = index;
        });
        return tracks[index];
      },

      toggleShuffle: () =>
        set((s) => {
          s.shuffle = !s.shuffle;
        }),

      cycleRepeat: () =>
        set((s) => {
          const idx = REPEAT_ORDER.indexOf(s.repeat);
          s.repeat = REPEAT_ORDER[(idx + 1) % REPEAT_ORDER.length];
        }),

      pushRecent: (file) =>
        set((s) => {
          s.recent = [
            file,
            ...s.recent.filter((r) => r.path !== file.path),
          ].slice(0, 30);
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
