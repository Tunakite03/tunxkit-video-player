import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

interface PlayerState {
  /** Map of path → last playback position in seconds (for resume). */
  positions: Record<string, number>;

  paused: boolean;
  duration: number;
  currentTime: number;
  buffered: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  isFullscreen: boolean;

  /** UI flicker: HUD shown overlay. */
  hudVisible: boolean;

  setPaused: (paused: boolean) => void;
  setDuration: (n: number) => void;
  setCurrentTime: (n: number) => void;
  setBuffered: (n: number) => void;
  setVolume: (n: number) => void;
  setMuted: (b: boolean) => void;
  setPlaybackRate: (n: number) => void;
  setFullscreen: (b: boolean) => void;
  setHudVisible: (b: boolean) => void;
  rememberPosition: (path: string, seconds: number) => void;
  forgetPosition: (path: string) => void;
  resetMediaState: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    immer((set) => ({
      positions: {},

      paused: true,
      duration: 0,
      currentTime: 0,
      buffered: 0,
      volume: 0.8,
      muted: false,
      playbackRate: 1,
      isFullscreen: false,
      hudVisible: true,

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
      setHudVisible: (b) =>
        set((s) => {
          s.hudVisible = b;
        }),
      rememberPosition: (path, seconds) =>
        set((s) => {
          if (!path || !Number.isFinite(seconds)) return;
          if (seconds > 5) s.positions[path] = Math.max(0, seconds);
          else delete s.positions[path];
        }),
      forgetPosition: (path) =>
        set((s) => {
          delete s.positions[path];
        }),
      resetMediaState: () =>
        set((s) => {
          s.paused = true;
          s.duration = 0;
          s.currentTime = 0;
          s.buffered = 0;
        }),
    })),
    {
      name: "tunxkit.player",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        positions: s.positions,
        volume: s.volume,
        muted: s.muted,
        playbackRate: s.playbackRate,
      }),
    },
  ),
);
