import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { isRecord } from "@/lib/persisted";
import {
  defaultSubtitleEncoding,
  isSubtitleEncoding,
  type SubtitleEncoding,
} from "@/features/subtitles/parse";

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
    case "subtitleEncoding":
      return (
        isSubtitleEncoding(value) ? value : defaultSubtitleEncoding(navigator.language)
      ) as SettingsState[K];
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
  scanRecursive: boolean;
  /** Show subtitles found next to a video as soon as it opens. */
  subtitlesEnabled: boolean;
  /** How subtitle files that are neither UTF-8 nor UTF-16 are decoded. */
  subtitleEncoding: SubtitleEncoding;
  setVolume: (v: number) => void;
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

type SettingKey = Exclude<keyof SettingsState, "setVolume" | "set">;

const SETTING_KEYS: readonly SettingKey[] = [
  "defaultVolume",
  "rememberPosition",
  "autoplayNext",
  "seekStepSeconds",
  "longSeekStepSeconds",
  "defaultPlaybackRate",
  "scanRecursive",
  "subtitlesEnabled",
  "subtitleEncoding",
];

/** Stored settings over the defaults: each one of the right type, normalized; others ignored. */
function restoreSettings(persisted: unknown, current: SettingsState): SettingsState {
  if (!isRecord(persisted)) return current;
  const restored: Partial<Pick<SettingsState, SettingKey>> = {};
  const restore = <K extends SettingKey>(key: K, value: SettingsState[K]) => {
    restored[key] = normalizeSetting(key, value);
  };
  for (const key of SETTING_KEYS) {
    const value = persisted[key];
    // Same type as the default, so the cast only names what was just checked.
    if (typeof value === typeof current[key]) restore(key, value as SettingsState[typeof key]);
  }
  return { ...current, ...restored };
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
      scanRecursive: true,
      subtitlesEnabled: true,
      subtitleEncoding: defaultSubtitleEncoding(navigator.language),
      setVolume: (v) =>
        set((s) => {
          s.defaultVolume = clamp(v, 0, 1);
        }),
      set: (key, value) =>
        set((s) => {
          (s as Record<string, unknown>)[key as string] = normalizeSetting(key, value);
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
      merge: restoreSettings,
    },
  ),
);
