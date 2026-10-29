import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store";
import { startPlayback, useVideoController } from "./use-video-controller";

/** Animation frames that only run when the test says so. */
let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;

function runFrame(now: number) {
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach((cb) => cb(now)));
}

function playingVideo() {
  const video = document.createElement("video");
  const media = { currentTime: 0, paused: false };
  Object.defineProperties(video, {
    currentTime: { get: () => media.currentTime, set: (t: number) => (media.currentTime = t) },
    paused: { get: () => media.paused },
  });
  return { ref: { current: video }, media };
}

beforeEach(() => {
  usePlayerStore.setState(usePlayerStore.getInitialState(), true);
  frames = new Map();
  nextFrameId = 1;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.set(nextFrameId, cb);
    return nextFrameId++;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => void frames.delete(id));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useVideoController live progress", () => {
  it("follows frames at a capped rate while the progress bar is shown", () => {
    const { ref, media } = playingVideo();
    renderHook(() => useVideoController(ref, true));

    media.currentTime = 1;
    runFrame(1000);
    expect(usePlayerStore.getState().currentTime).toBe(1);

    // A 120 Hz frame arriving 8 ms later doesn't re-render the seek bar…
    media.currentTime = 1.008;
    runFrame(1008);
    expect(usePlayerStore.getState().currentTime).toBe(1);

    // …but one past the interval does.
    media.currentTime = 1.04;
    runFrame(1040);
    expect(usePlayerStore.getState().currentTime).toBe(1.04);
  });

  it("stops following frames once the progress bar is hidden", () => {
    const { ref, media } = playingVideo();
    const { rerender } = renderHook(({ live }) => useVideoController(ref, live), {
      initialProps: { live: true },
    });
    runFrame(1000);

    rerender({ live: false });
    expect(frames.size).toBe(0);

    media.currentTime = 5;
    runFrame(2000);
    expect(usePlayerStore.getState().currentTime).toBe(0);
  });
});

describe("startPlayback", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("ignores a play() cut short by a pause or a new source, and logs other failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const video = document.createElement("video");
    const play = vi.spyOn(video, "play");

    play.mockRejectedValueOnce(new DOMException("interrupted", "AbortError"));
    startPlayback(video);
    await flush();
    expect(warn).not.toHaveBeenCalled();

    const blocked = new DOMException("not allowed", "NotAllowedError");
    play.mockRejectedValueOnce(blocked);
    startPlayback(video);
    await flush();
    expect(warn).toHaveBeenCalledWith(
      "playback did not start",
      expect.objectContaining({ error: blocked }),
    );
  });
});
