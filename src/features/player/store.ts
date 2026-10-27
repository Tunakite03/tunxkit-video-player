import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { useSettingsStore } from "@/features/settings/store";

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

/** Oldest resume positions are dropped beyond this many files. */
const MAX_POSITIONS = 500;

interface PlayerState {
  paused: boolean;
  duration: number;
  currentTime: number;
  buffered: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  isFullscreen: boolean;

  setPaused: (paused: boolean) => void;
  setDuration: (n: number) => void;
  setCurrentTime: (n: number) => void;
  setBuffered: (n: number) => void;
  setVolume: (n: number) => void;
  setMuted: (b: boolean) => void;
  setPlaybackRate: (n: number) => void;
  setFullscreen: (b: boolean) => void;
  resetMediaState: () => void;
}

/**
 * Live playback state mirrored from the video element. Not persisted: it changes
 * every animation frame while playing, and `persist` writes storage on every set.
 */
export const usePlayerStore = create<PlayerState>()(
  immer((set) => ({
    paused: true,
    duration: 0,
    currentTime: 0,
    buffered: 0,
    volume: useSettingsStore.getState().defaultVolume,
    muted: false,
    playbackRate: 1,
    isFullscreen: false,

    setPaused: (paused) =>
      set((s) => {
        s.paused = paused;
      }),
    setDuration: (n) =>
      set((s) => {
        s.duration = Math.max(0, Number.isFinite(n) ? n : 0);
      }),
    setCurrentTime: (n) =>
      set((s) => {
        s.currentTime = Math.max(0, Number.isFinite(n) ? n : 0);
      }),
    setBuffered: (n) =>
      set((s) => {
        s.buffered = clamp(n, 0, 1);
      }),
    setVolume: (n) =>
      set((s) => {
        s.volume = clamp(n, 0, 1);
        if (s.volume > 0) s.muted = false;
      }),
    setMuted: (b) =>
      set((s) => {
        s.muted = b;
      }),
    setPlaybackRate: (n) =>
      set((s) => {
        s.playbackRate = clamp(n, 0.25, 2);
      }),
    setFullscreen: (b) =>
      set((s) => {
        s.isFullscreen = b;
      }),
    resetMediaState: () =>
      set((s) => {
        s.paused = true;
        s.duration = 0;
        s.currentTime = 0;
        s.buffered = 0;
      }),
  })),
);

interface ResumeState {
  /** Map of path → last playback position in seconds, least recently updated first. */
  positions: Record<string, number>;
  rememberPosition: (path: string, seconds: number) => void;
  forgetPosition: (path: string) => void;
}

export const useResumeStore = create<ResumeState>()(
  persist(
    immer((set) => ({
      positions: {},
      rememberPosition: (path, seconds) =>
        set((s) => {
          if (!path || !Number.isFinite(seconds)) return;
          // Re-insert so the key moves to the end and the oldest entries are trimmed first.
          delete s.positions[path];
          if (seconds <= 5) return;
          s.positions[path] = seconds;
          const keys = Object.keys(s.positions);
          for (let i = 0; i < keys.length - MAX_POSITIONS; i++) delete s.positions[keys[i]];
        }),
      forgetPosition: (path) =>
        set((s) => {
          delete s.positions[path];
        }),
    })),
    {
      // Same key as the old combined player store, so saved positions carry over.
      name: "tunxkit.player",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ positions: s.positions }),
      merge: (persisted, current) => ({
        ...current,
        positions: (persisted as Partial<ResumeState> | undefined)?.positions ?? {},
      }),
    },
  ),
);
