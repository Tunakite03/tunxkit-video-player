import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePlaylistStore } from "@/features/playlist/store";
import { useSettingsStore } from "@/features/settings/store";
import type { MediaFile } from "@/types/media";
import { usePlayerStore, useResumeStore } from "../store";
import { Player } from "./Player";

const getMediaInfo = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tauri", () => ({
  getMediaInfo,
  toMediaSrc: (path: string) => `asset://${path}`,
}));

const file = (name: string): MediaFile => ({
  path: `/videos/${name}`,
  name,
  size: 1,
  extension: "mp4",
});

/** The player's <video>, with the media state happy-dom doesn't simulate made controllable. */
interface TestVideo extends HTMLVideoElement {
  fire: (event: string) => void;
  /** Pretend the source loaded with this duration. */
  loaded: (duration: number) => void;
  failWith: (code: number) => void;
}

let play: ReturnType<typeof vi.fn<() => Promise<void>>>;

function renderPlayer(): TestVideo {
  const { container } = render(
    <TooltipProvider>
      <Player />
    </TooltipProvider>,
  );
  const video = container.querySelector("video") as TestVideo;
  let currentTime = 0;
  const media = { duration: NaN, readyState: 0, error: null as { code: number } | null };
  Object.defineProperties(video, {
    currentTime: { get: () => currentTime, set: (t: number) => (currentTime = t) },
    duration: { get: () => media.duration },
    readyState: { get: () => media.readyState },
    currentSrc: { get: () => video.getAttribute("src") ?? "" },
    error: { get: () => media.error },
  });
  Object.assign(video, {
    fire: (event: string) => act(() => void video.dispatchEvent(new Event(event))),
    loaded(duration: number) {
      media.duration = duration;
      media.readyState = 1; // HAVE_METADATA
      video.fire("loadedmetadata");
    },
    failWith(code: number) {
      media.error = { code };
      video.fire("error");
    },
  });
  return video;
}

beforeEach(() => {
  usePlaylistStore.setState(usePlaylistStore.getInitialState(), true);
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  usePlayerStore.setState(usePlayerStore.getInitialState(), true);
  useResumeStore.setState(useResumeStore.getInitialState(), true);
  play = vi.fn(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  // happy-dom has neither MediaError nor the readyState constants; the player only reads them.
  if (typeof MediaError === "undefined") vi.stubGlobal("MediaError", { MEDIA_ERR_DECODE: 3 });
  if (HTMLMediaElement.HAVE_NOTHING === undefined)
    Object.defineProperty(HTMLMediaElement, "HAVE_NOTHING", { value: 0 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Player", () => {
  it("shows the empty state without a track", () => {
    renderPlayer();
    expect(screen.getByText("Open a video to start playing")).toBeTruthy();
  });

  it("loads the current track, resumes where it left off and plays", () => {
    useResumeStore.setState({ positions: { "/videos/a.mp4": 42 } });
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    const video = renderPlayer();
    expect(video.getAttribute("src")).toBe("asset:///videos/a.mp4");

    video.loaded(100);
    expect(video.currentTime).toBe(42);
    expect(play).toHaveBeenCalled();
    expect(usePlaylistStore.getState().recent[0].name).toBe("a.mp4");
  });

  it("starts over when the saved position is near the end", () => {
    useResumeStore.setState({ positions: { "/videos/a.mp4": 97 } });
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    const video = renderPlayer();
    video.loaded(100);
    expect(video.currentTime).toBe(0);
  });

  it("remembers the position when paused", () => {
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    const video = renderPlayer();
    video.loaded(100);
    video.currentTime = 30;
    video.fire("pause");
    expect(useResumeStore.getState().positions["/videos/a.mp4"]).toBe(30);
  });

  it("moves on to the next track when one ends", () => {
    usePlaylistStore.getState().setQueue([file("a.mp4"), file("b.mp4")]);
    const video = renderPlayer();
    video.loaded(100);
    video.fire("ended");
    expect(usePlaylistStore.getState().currentIndex).toBe(1);
    expect(video.getAttribute("src")).toBe("asset:///videos/b.mp4");
  });

  it("replays the track on repeat one", () => {
    usePlaylistStore.setState({ repeat: "one" });
    usePlaylistStore.getState().setQueue([file("a.mp4"), file("b.mp4")]);
    const video = renderPlayer();
    video.loaded(100);
    video.currentTime = 100;
    play.mockClear();
    video.fire("ended");
    expect(usePlaylistStore.getState().currentIndex).toBe(0);
    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();
  });

  it("seeks with the arrow keys by the configured step", () => {
    useSettingsStore.getState().set("seekStepSeconds", 7);
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    const video = renderPlayer();
    video.loaded(100);
    video.currentTime = 50;
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(video.currentTime).toBe(57);
  });

  it("says when the file is gone", async () => {
    getMediaInfo.mockRejectedValue(new Error("gone"));
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    const video = renderPlayer();
    video.failWith(4);
    expect(await screen.findByText("The file was moved, deleted, or cannot be read.")).toBeTruthy();
    expect(getMediaInfo).toHaveBeenCalledWith("/videos/a.mp4");
  });

  it("says when a file that exists can't be decoded", async () => {
    getMediaInfo.mockResolvedValue(file("a.mp4"));
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    const video = renderPlayer();
    video.failWith(3);
    expect(await screen.findByText("The video could not be decoded.")).toBeTruthy();
  });
});
