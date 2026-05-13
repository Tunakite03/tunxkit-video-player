import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

function normalizeSetting<K extends keyof SettingsState>(
  key: K,
  value: SettingsState[K],
): SettingsState[K] {
  switch (key) {
    case "defaultVolume":
      return clamp(value as number, 0, 1) as SettingsState[K];
    case "seekStepSeconds":
      return clamp(value as number, 1, 60) as SettingsState[K];
    case "longSeekStepSeconds":
      return clamp(value as number, 5, 300) as SettingsState[K];
    case "defaultPlaybackRate":
      return clamp(value as number, 0.25, 2) as SettingsState[K];
    default:
      return value;
  }
}

export interface SettingsState {
  defaultVolume: number;
  rememberPosition: boolean;
  autoplayNext: boolean;
  seekStepSeconds: number;
  longSeekStepSeconds: number;
  defaultPlaybackRate: number;
  hardwareAccel: boolean;
  scanRecursive: boolean;
  setVolume: (v: number) => void;
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set) => ({
      defaultVolume: 0.8,
      rememberPosition: true,
      autoplayNext: true,
      seekStepSeconds: 5,
      longSeekStepSeconds: 10,
      defaultPlaybackRate: 1,
      hardwareAccel: true,
      scanRecursive: true,
      setVolume: (v) =>
        set((s) => {
          s.defaultVolume = clamp(v, 0, 1);
        }),
      set: (key, value) =>
        set((s) => {
          (s as Record<string, unknown>)[key as string] = normalizeSetting(
            key,
            value,
          );
        }),
    })),
    {
      name: "tunxkit.settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { setVolume: _a, set: _b, ...rest } = state;
        void _a;
        void _b;
        return rest;
      },
    },
  ),
);
