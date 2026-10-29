import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

/** Store `state` under `key` as zustand's persist middleware does. */
const stored = (key: string, state: unknown) =>
  localStorage.setItem(key, JSON.stringify({ state, version: 0 }));

/** Fresh store modules, so they rehydrate from the current localStorage. */
const load = async () => ({
  ...(await import("@/features/settings/store")),
  ...(await import("@/features/player/store")),
  ...(await import("@/features/playlist/store")),
  ...(await import("@/features/library/store")),
});

describe("restoring persisted state", () => {
  it("keeps valid settings, normalizes them, and ignores the wrong types", async () => {
    stored("tunxkit.settings", {
      defaultVolume: 7,
      seekStepSeconds: "fast",
      autoplayNext: false,
      subtitlesEnabled: "yes",
      subtitleEncoding: "utf-7",
      unknownSetting: 1,
    });
    const { useSettingsStore } = await load();
    const settings = useSettingsStore.getState();
    expect(settings.defaultVolume).toBe(1);
    expect(settings.seekStepSeconds).toBe(5);
    expect(settings.autoplayNext).toBe(false);
    expect(settings.subtitlesEnabled).toBe(true);
    expect(settings.subtitleEncoding).toBe("windows-1252");
    expect("unknownSetting" in settings).toBe(false);
  });

  it("keeps only real resume positions", async () => {
    stored("tunxkit.player", {
      positions: { "/v/a.mp4": 42, "/v/b.mp4": "42", "/v/c.mp4": -1, "/v/d.mp4": null },
    });
    const { useResumeStore } = await load();
    expect(useResumeStore.getState().positions).toEqual({ "/v/a.mp4": 42 });
  });

  it("keeps well-formed recent files and playback modes", async () => {
    stored("tunxkit.playlist", {
      recent: [
        { path: "/v/a.mp4", name: "a.mp4", size: 1, extension: "mp4", modified: null, extra: 1 },
        { path: "/v/b.mp4", name: "b.mp4" },
        "c.mp4",
      ],
      shuffle: "on",
      repeat: "all",
    });
    const { usePlaylistStore } = await load();
    const playlist = usePlaylistStore.getState();
    expect(playlist.recent).toEqual([
      { path: "/v/a.mp4", name: "a.mp4", size: 1, extension: "mp4" },
    ]);
    expect(playlist.shuffle).toBe(false);
    expect(playlist.repeat).toBe("all");
  });

  it("keeps each well-formed library folder once", async () => {
    stored("tunxkit.library", {
      folders: [{ path: "/movies", addedAt: 5 }, { path: "/movies" }, { path: 3 }, null],
    });
    const { useLibraryStore } = await load();
    expect(useLibraryStore.getState().folders).toEqual([{ path: "/movies", addedAt: 5 }]);
  });

  it("restores a known subtitle encoding", async () => {
    stored("tunxkit.settings", { subtitleEncoding: "windows-1258" });
    const { useSettingsStore } = await load();
    expect(useSettingsStore.getState().subtitleEncoding).toBe("windows-1258");
  });

  it("falls back to the defaults when stored state isn't an object", async () => {
    stored("tunxkit.settings", ["not", "settings"]);
    stored("tunxkit.library", { folders: "nope" });
    const { useSettingsStore, useLibraryStore } = await load();
    expect(useSettingsStore.getState().defaultVolume).toBe(0.8);
    expect(useLibraryStore.getState().folders).toEqual([]);
  });
});
