import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

/** Fresh store modules, so persisted state is rehydrated from the current localStorage. */
const load = async () => {
  const settings = await import("@/features/settings/store");
  const player = await import("./store");
  return { ...settings, ...player };
};

describe("usePlayerStore", () => {
  it("starts at the default volume setting", async () => {
    localStorage.setItem(
      "tunxkit.settings",
      JSON.stringify({ state: { defaultVolume: 0.35 }, version: 0 }),
    );
    const { usePlayerStore } = await load();
    expect(usePlayerStore.getState().volume).toBe(0.35);
  });

  it("clamps volume and rate, and unmutes when volume goes up", async () => {
    const { usePlayerStore } = await load();
    const s = usePlayerStore.getState();
    s.setMuted(true);
    s.setVolume(3);
    expect(usePlayerStore.getState()).toMatchObject({ volume: 1, muted: false });
    s.setVolume(Number.NaN);
    expect(usePlayerStore.getState().volume).toBe(0);
    s.setPlaybackRate(10);
    expect(usePlayerStore.getState().playbackRate).toBe(2);
  });

  it("never writes playback state to storage", async () => {
    const { usePlayerStore } = await load();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    for (let i = 0; i < 100; i++) usePlayerStore.getState().setCurrentTime(i / 10);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("useResumeStore", () => {
  it("keeps positions past the first 5 seconds and forgets earlier ones", async () => {
    const { useResumeStore } = await load();
    const s = useResumeStore.getState();
    s.rememberPosition("/a.mp4", 42);
    s.rememberPosition("/b.mp4", 3);
    expect(useResumeStore.getState().positions).toEqual({ "/a.mp4": 42 });
    s.rememberPosition("/a.mp4", 2);
    expect(useResumeStore.getState().positions).toEqual({});
  });

  it("drops the least recently updated positions beyond 500 files", async () => {
    const { useResumeStore } = await load();
    const s = useResumeStore.getState();
    for (let i = 0; i < 505; i++) s.rememberPosition(`/v${i}.mp4`, 60);
    s.rememberPosition("/v0.mp4", 61); // touched again, so it survives
    s.rememberPosition("/new.mp4", 60);
    const keys = Object.keys(useResumeStore.getState().positions);
    expect(keys).toHaveLength(500);
    expect(keys).toContain("/v0.mp4");
    expect(keys).not.toContain("/v6.mp4");
    expect(keys.at(-1)).toBe("/new.mp4");
  });

  it("loads positions saved by the old combined player store and ignores the rest", async () => {
    localStorage.setItem(
      "tunxkit.player",
      JSON.stringify({
        state: { positions: { "/old.mp4": 120 }, volume: 1, muted: true, playbackRate: 2 },
        version: 0,
      }),
    );
    const { useResumeStore } = await load();
    expect(useResumeStore.getState()).not.toHaveProperty("volume");
    expect(useResumeStore.getState().positions).toEqual({ "/old.mp4": 120 });
  });
});
