import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "@/types/media";
import { selectCurrentTrack, usePlaylistStore } from "./store";

const file = (name: string): MediaFile => ({
  path: `/videos/${name}`,
  name,
  size: 1,
  extension: "mp4",
});
const files = (...names: string[]) => names.map(file);

const state = () => usePlaylistStore.getState();
const currentName = () => selectCurrentTrack(state())?.file.name;
const nextName = () => state().next()?.file.name;
const prevName = () => state().prev()?.file.name;

beforeEach(() => {
  usePlaylistStore.setState(usePlaylistStore.getInitialState(), true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setQueue", () => {
  it("drops duplicate paths and keeps the requested start track", () => {
    state().setQueue(files("a", "b", "a", "c"), 3);
    expect(state().tracks.map((t) => t.file.name)).toEqual(["a", "b", "c"]);
    expect(currentName()).toBe("c");
  });

  it("clamps an out-of-range start index", () => {
    state().setQueue(files("a", "b"), 9);
    expect(currentName()).toBe("b");
  });

  it("leaves nothing selected for an empty queue", () => {
    state().setQueue([], 0);
    expect(state().currentIndex).toBe(-1);
    expect(state().next()).toBeUndefined();
  });
});

describe("next / prev in order", () => {
  it("stops at the end with repeat off", () => {
    state().setQueue(files("a", "b"), 0);
    expect(nextName()).toBe("b");
    expect(state().next()).toBeUndefined();
    expect(currentName()).toBe("b");
  });

  it("wraps with repeat all, and an explicit next wraps with repeat one too", () => {
    state().setQueue(files("a", "b"), 1);
    state().cycleRepeat(); // all
    expect(nextName()).toBe("a");
    state().setQueue(files("a", "b"), 1);
    state().cycleRepeat(); // one
    expect(state().repeat).toBe("one");
    expect(nextName()).toBe("a");
  });

  it("stays on the first track with repeat off, wraps otherwise", () => {
    state().setQueue(files("a", "b", "c"), 0);
    expect(prevName()).toBe("a");
    state().cycleRepeat(); // all
    expect(prevName()).toBe("c");
  });
});

describe("removeAt", () => {
  it("keeps the current track selected when an earlier one is removed", () => {
    state().setQueue(files("a", "b", "c"), 2);
    state().removeAt(0);
    expect(currentName()).toBe("c");
  });

  it("selects the following track when the current one is removed", () => {
    state().setQueue(files("a", "b", "c"), 1);
    state().removeAt(1);
    expect(currentName()).toBe("c");
    state().removeAt(1);
    expect(currentName()).toBe("a");
  });

  it("ignores invalid indexes", () => {
    state().setQueue(files("a"), 0);
    state().removeAt(5);
    expect(state().tracks).toHaveLength(1);
  });
});

describe("shuffle", () => {
  const playCycle = () => {
    const order = [currentName()];
    for (let i = 0; i < 20; i++) {
      const name = nextName();
      if (!name) break;
      order.push(name);
    }
    return order;
  };

  it("plays every track exactly once, then stops with repeat off", () => {
    for (let run = 0; run < 20; run++) {
      state().setQueue(files("a", "b", "c", "d", "e"), 0);
      if (!state().shuffle) state().toggleShuffle();
      const order = playCycle();
      expect(order).toHaveLength(5);
      expect(new Set(order).size).toBe(5);
    }
  });

  it("starts a new cycle with repeat all without repeating the current track", () => {
    for (let run = 0; run < 20; run++) {
      state().setQueue(files("a", "b", "c"), 0);
      if (!state().shuffle) state().toggleShuffle();
      while (state().repeat !== "all") state().cycleRepeat();
      const played = [currentName()];
      for (let i = 0; i < 9; i++) played.push(nextName());
      // The track playing when a cycle ends counts toward the next one, so after the
      // first cycle (0..2) each new cycle adds the other two: 2..4, 4..6, 6..8.
      for (const start of [0, 2, 4, 6]) {
        expect(new Set(played.slice(start, start + 3)).size).toBe(3);
      }
      for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    }
  });

  it("previous retraces the shuffled order", () => {
    state().setQueue(files("a", "b", "c", "d"), 0);
    state().toggleShuffle();
    const order = playCycle();
    const back = [prevName(), prevName(), prevName()];
    expect(back).toEqual(order.slice(0, -1).reverse());
  });

  it("forgets removed tracks so previous never lands on a stale index", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // always the first unplayed track
    state().setQueue(files("a", "b", "c"), 0);
    state().toggleShuffle();
    expect(nextName()).toBe("b");
    expect(nextName()).toBe("c");
    state().removeAt(1); // b
    expect(state().history).not.toContain("/videos/b");
    expect(prevName()).toBe("a");
  });

  it("keeps a one-track queue playable with repeat all", () => {
    state().setQueue(files("a"), 0);
    state().toggleShuffle();
    expect(state().next()).toBeUndefined();
    state().cycleRepeat(); // all
    expect(nextName()).toBe("a");
  });
});

describe("jumpTo", () => {
  it("records history and counts the track as played in the shuffle cycle", () => {
    state().setQueue(files("a", "b", "c"), 0);
    state().toggleShuffle();
    expect(state().jumpTo(2)?.file.name).toBe("c");
    expect(nextName()).toBe("b");
    expect(state().next()).toBeUndefined();
    expect(state().jumpTo(7)).toBeUndefined();
  });
});

describe("pushRecent", () => {
  it("moves a replayed file to the front and caps the list at 30", () => {
    for (let i = 0; i < 35; i++) state().pushRecent(file(`f${i}`));
    state().pushRecent(file("f10"));
    expect(state().recent).toHaveLength(30);
    expect(state().recent[0].name).toBe("f10");
    expect(state().recent.filter((f) => f.name === "f10")).toHaveLength(1);
  });
});
