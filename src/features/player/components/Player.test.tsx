import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePlaylistStore } from "@/features/playlist/store";
import { useSettingsStore } from "@/features/settings/store";
import { PlayerPage } from "@/pages/PlayerPage";
import { useUIStore } from "@/stores/ui-store";
import { useSubtitleStore } from "@/features/subtitles/store";
import type { MediaFile } from "@/types/media";
import { usePlayerStore, useResumeStore } from "../store";

const getMediaInfo = vi.hoisted(() => vi.fn());
const findSubtitleFiles = vi.hoisted(() => vi.fn());
const readSubtitleFile = vi.hoisted(() => vi.fn());
const extractEmbeddedSubtitles = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tauri", () => ({
  getMediaInfo,
  findSubtitleFiles,
  readSubtitleFile,
  extractEmbeddedSubtitles,
  pickSubtitleFiles: vi.fn(),
  showInFolder: vi.fn(),
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

/** Stand-ins for the webview's in-band text tracks, which happy-dom doesn't model. */
class FakeTextTrack extends EventTarget {
  mode: TextTrackMode = "showing";
  activeCues: Pick<VTTCue, "startTime" | "endTime" | "text">[] = [];
  readonly kind: TextTrackKind;
  readonly label: string;
  readonly language: string;
  constructor(kind: TextTrackKind, label: string, language: string) {
    super();
    this.kind = kind;
    this.label = label;
    this.language = language;
  }
}

class FakeTextTrackList extends EventTarget {
  length = 0;
  [index: number]: FakeTextTrack;
  add(track: FakeTextTrack) {
    this[this.length++] = track;
    act(() => void this.dispatchEvent(new Event("addtrack")));
  }
}

const textTracksDescriptor = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "textTracks",
);

function useFakeTextTracks(): FakeTextTrackList {
  const list = new FakeTextTrackList();
  Object.defineProperty(HTMLMediaElement.prototype, "textTracks", {
    configurable: true,
    get: () => list,
  });
  return list;
}

let play: ReturnType<typeof vi.fn<() => Promise<void>>>;

function renderPlayer(): TestVideo {
  const { container } = render(
    <TooltipProvider>
      <PlayerPage />
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
  useUIStore.setState({ playlistOpen: false });
  useSubtitleStore.setState(useSubtitleStore.getInitialState(), true);
  findSubtitleFiles.mockResolvedValue([]);
  extractEmbeddedSubtitles.mockResolvedValue([]);
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
  if (textTracksDescriptor)
    Object.defineProperty(HTMLMediaElement.prototype, "textTracks", textTracksDescriptor);
  else delete (HTMLMediaElement.prototype as { textTracks?: unknown }).textTracks;
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

  it("goes fullscreen with the whole page, so the open playlist stays visible", () => {
    // happy-dom has no Fullscreen API; record which element asked for it.
    const requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    useUIStore.setState({ playlistOpen: true });
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    const video = renderPlayer();

    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" })));

    const target = requestFullscreen.mock.contexts[0] as HTMLElement;
    expect(target.contains(video)).toBe(true);
    expect(target.contains(screen.getByRole("heading", { name: "Playlist" }))).toBe(true);
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen;
  });

  it("shows subtitles found beside the video in time with playback, and C hides them", async () => {
    findSubtitleFiles.mockResolvedValue([{ path: "/videos/a.en.srt", name: "a.en.srt" }]);
    readSubtitleFile.mockResolvedValue(
      new TextEncoder().encode("1\n00:00:01,000 --> 00:00:03,000\nHello <i>there</i>\n"),
    );
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    const video = renderPlayer();
    video.loaded(100);
    await waitFor(() => expect(useSubtitleStore.getState().activeTrackId).toBe("/videos/a.en.srt"));
    expect(findSubtitleFiles).toHaveBeenCalledWith("/videos/a.mp4");
    expect(screen.queryByTestId("subtitle-overlay")).toBeNull();

    video.currentTime = 2;
    video.fire("timeupdate");
    expect(screen.getByTestId("subtitle-overlay").textContent).toBe("Hello there");

    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" })));
    expect(screen.queryByTestId("subtitle-overlay")).toBeNull();
    expect(useSettingsStore.getState().subtitlesEnabled).toBe(false);

    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" })));
    expect(screen.getByTestId("subtitle-overlay").textContent).toBe("Hello there");
  });

  it("keeps subtitles hidden on a new video when they were turned off", async () => {
    useSettingsStore.getState().set("subtitlesEnabled", false);
    findSubtitleFiles.mockResolvedValue([{ path: "/videos/a.srt", name: "a.srt" }]);
    readSubtitleFile.mockResolvedValue(
      new TextEncoder().encode("1\n00:00:00,000 --> 00:00:09,000\nHidden\n"),
    );
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    renderPlayer();
    await waitFor(() => expect(useSubtitleStore.getState().tracks).toHaveLength(1));
    expect(useSubtitleStore.getState().activeTrackId).toBeNull();
  });

  it("offers the webview's own subtitle tracks and draws the shown one's cues", () => {
    const list = useFakeTextTracks();
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    renderPlayer();
    const english = new FakeTextTrack("subtitles", "", "en");
    list.add(english);
    list.add(new FakeTextTrack("metadata", "chapters", ""));

    const { tracks, activeTrackId } = useSubtitleStore.getState();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ source: "inband", label: "English" });
    expect(activeTrackId).toBe(tracks[0].id);
    // Loads cues for the overlay without the webview drawing them as well.
    expect(english.mode).toBe("hidden");

    english.activeCues = [{ startTime: 1, endTime: 2, text: "Xin <i>chào</i>" }];
    act(() => void english.dispatchEvent(new Event("cuechange")));
    expect(screen.getByTestId("subtitle-overlay").textContent).toBe("Xin chào");

    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" })));
    expect(english.mode).toBe("disabled");
    expect(screen.queryByTestId("subtitle-overlay")).toBeNull();
  });

  it("replaces the webview's tracks with the ones the backend read from the file", async () => {
    const list = useFakeTextTracks();
    extractEmbeddedSubtitles.mockResolvedValue([
      {
        id: 3,
        name: null,
        language: "vie",
        codec: "TX3G",
        default: true,
        forced: false,
        cues: [{ start: 0, end: 5, text: "Một <b>hai</b>" }],
      },
    ]);
    usePlaylistStore.getState().setQueue([file("a.mp4")]);
    const video = renderPlayer();
    const webviewCopy = new FakeTextTrack("subtitles", "", "vi");
    list.add(webviewCopy);

    await waitFor(() => expect(useSubtitleStore.getState().activeTrackId).toBe("embedded:3"));
    expect(useSubtitleStore.getState().tracks.map((t) => t.label)).toEqual(["Vietnamese"]);
    expect(webviewCopy.mode).toBe("disabled");
    expect(extractEmbeddedSubtitles).toHaveBeenCalledWith("/videos/a.mp4");

    video.currentTime = 1;
    video.fire("timeupdate");
    expect(screen.getByTestId("subtitle-overlay").textContent).toBe("Một hai");
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
