import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tauri", () => ({ toMediaSrc: (path: string) => `asset://${path}` }));

/** Stand-in for the detached <video> the extractor decodes with; tests fire its events. */
class FakeVideo extends EventTarget {
  src = "";
  preload = "";
  crossOrigin: string | null = null;
  muted = false;
  playsInline = false;
  duration = NaN;
  videoWidth = 1920;
  videoHeight = 1080;
  seekedTo: number | null = null;
  set currentTime(t: number) {
    this.seekedTo = t;
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
  load() {}
  /** Report metadata, then finish the seek the extractor asks for. */
  decode(duration: number) {
    this.duration = duration;
    this.dispatchEvent(new Event("loadedmetadata"));
    this.dispatchEvent(new Event("seeked"));
  }
  fail() {
    this.dispatchEvent(new Event("error"));
  }
}

let videos: FakeVideo[];
let thumbnails: typeof import("./thumbnails");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  videos = [];
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "video") {
      const video = new FakeVideo();
      videos.push(video);
      return video as unknown as HTMLElement;
    }
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => {} }),
        toDataURL: () => "data:image/jpeg;base64,frame",
      } as unknown as HTMLElement;
    }
    return createElement(tag);
  });
  // The cache and queue are module state, so start each test with a fresh copy.
  vi.resetModules();
  thumbnails = await import("./thumbnails");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getThumbnail", () => {
  it("grabs a frame 10% in (between 1 and 10 s) and reports the duration", async () => {
    const pending = thumbnails.getThumbnail("/v/a.mp4");
    expect(videos[0].src).toBe("asset:///v/a.mp4");
    videos[0].decode(60);
    expect(await pending).toEqual({ dataUrl: "data:image/jpeg;base64,frame", duration: 60 });
    expect(videos[0].seekedTo).toBe(6);
    // The source is released once the frame is taken.
    expect(videos[0].src).toBe("");
  });

  it("clamps the seek target for very short and very long videos", async () => {
    const short = thumbnails.getThumbnail("/v/short.mp4");
    const long = thumbnails.getThumbnail("/v/long.mp4");
    videos[0].decode(4);
    videos[1].decode(7200);
    await Promise.all([short, long]);
    expect(videos[0].seekedTo).toBe(1);
    expect(videos[1].seekedTo).toBe(10);
  });

  it("decodes each file once: concurrent and later requests share the result", async () => {
    const first = thumbnails.getThumbnail("/v/a.mp4");
    const second = thumbnails.getThumbnail("/v/a.mp4");
    expect(videos).toHaveLength(1);
    videos[0].decode(30);
    expect(await second).toEqual(await first);

    expect(thumbnails.getCachedThumbnail("/v/a.mp4")?.duration).toBe(30);
    await thumbnails.getThumbnail("/v/a.mp4");
    expect(videos).toHaveLength(1);
  });

  it("decodes at most two files at a time and starts the next when one finishes", async () => {
    const results = ["/v/1.mp4", "/v/2.mp4", "/v/3.mp4"].map((p) => thumbnails.getThumbnail(p));
    expect(videos).toHaveLength(2);
    videos[0].decode(20);
    await results[0];
    await flush();
    expect(videos).toHaveLength(3);
    videos[1].decode(20);
    videos[2].decode(20);
    await Promise.all(results);
  });

  it("resolves an empty thumbnail for a broken file and remembers the failure", async () => {
    const pending = thumbnails.getThumbnail("/v/broken.mp4");
    videos[0].fail();
    expect(await pending).toEqual({ dataUrl: null, duration: null });
    await thumbnails.getThumbnail("/v/broken.mp4");
    expect(videos).toHaveLength(1);
  });

  it("gives up on a file that never loads", async () => {
    vi.useFakeTimers();
    const pending = thumbnails.getThumbnail("/v/stuck.mp4");
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toEqual({ dataUrl: null, duration: null });
  });
});
