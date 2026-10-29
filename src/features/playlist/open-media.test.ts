import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "@/types/media";

const tauri = vi.hoisted(() => ({
  getMediaInfo: vi.fn(),
  onOpenFiles: vi.fn(),
  pickFolder: vi.fn(),
  pickVideoFiles: vi.fn(),
  scanDirectory: vi.fn(),
  takePendingMediaFiles: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tauri", () => tauri);
vi.mock("sonner", () => ({ toast }));
vi.mock("@/app/router", () => ({ router: { navigate } }));

import { usePlaylistStore } from "./store";
import { mediaInfoFor, playFound, playRecent, receiveOpenedFiles, scanPaths } from "./open-media";

const file = (name: string): MediaFile => ({
  path: `/videos/${name}`,
  name,
  size: 1,
  extension: "mp4",
});
const queued = () => usePlaylistStore.getState().tracks.map((t) => t.file.name);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  usePlaylistStore.setState(usePlaylistStore.getInitialState(), true);
});

describe("receiveOpenedFiles", () => {
  it("subscribes before taking the files that arrived early, then plays both", async () => {
    let emit: (files: MediaFile[]) => void = () => {};
    const calls: string[] = [];
    tauri.onOpenFiles.mockImplementation(async (handler: typeof emit) => {
      calls.push("listen");
      emit = handler;
      return () => calls.push("unlisten");
    });
    tauri.takePendingMediaFiles.mockImplementation(async () => {
      calls.push("take");
      return [file("early.mp4")];
    });

    const stop = receiveOpenedFiles();
    await flush();
    expect(calls).toEqual(["listen", "take"]);
    expect(queued()).toEqual(["early.mp4"]);
    expect(navigate).toHaveBeenCalledWith("/player");
    expect(toast.success).toHaveBeenCalledWith("Loaded 1 file");

    emit([file("later.mp4"), file("more.mp4")]);
    await flush();
    expect(queued()).toEqual(["later.mp4", "more.mp4"]);

    stop();
    expect(calls).toContain("unlisten");
  });

  it("does nothing when there is nothing to open", async () => {
    tauri.onOpenFiles.mockResolvedValue(() => {});
    tauri.takePendingMediaFiles.mockResolvedValue([]);
    receiveOpenedFiles();
    await flush();
    expect(navigate).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("unsubscribes and skips the early files when stopped before subscribing finished", async () => {
    const unlisten = vi.fn();
    tauri.onOpenFiles.mockResolvedValue(unlisten);
    const stop = receiveOpenedFiles();
    stop();
    await flush();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(tauri.takePendingMediaFiles).not.toHaveBeenCalled();
  });

  it("is a no-op outside Tauri", async () => {
    tauri.onOpenFiles.mockRejectedValue(new Error("no tauri"));
    const stop = receiveOpenedFiles();
    await flush();
    expect(tauri.takePendingMediaFiles).not.toHaveBeenCalled();
    stop();
  });
});

describe("scanPaths", () => {
  it("merges every path's videos and lists the paths that fail", async () => {
    const gone = new Error("gone");
    tauri.scanDirectory.mockImplementation(async (path: string) => {
      if (path === "/bad") throw gone;
      return { files: [file(`${path.slice(1)}.mp4`)], truncated: false };
    });
    const found = await scanPaths(["/a", "/bad", "/b"]);
    expect(found.files.map((f) => f.name)).toEqual(["a.mp4", "b.mp4"]);
    expect(found.failed).toEqual([{ path: "/bad", error: gone }]);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("warns when a scan hit the file cap", async () => {
    tauri.scanDirectory.mockResolvedValue({ files: [file("x.mp4")], truncated: true });
    await scanPaths(["/huge"]);
    expect(toast.warning).toHaveBeenCalledOnce();
  });
});

describe("mediaInfoFor", () => {
  it("lists the paths the backend rejects", async () => {
    tauri.getMediaInfo.mockImplementation(async (path: string) => {
      if (path.endsWith(".txt")) throw new Error("not a video");
      return file(path.slice(1));
    });
    const found = await mediaInfoFor(["/a.mp4", "/notes.txt", "/b.mp4"]);
    expect(found.files.map((f) => f.name)).toEqual(["a.mp4", "b.mp4"]);
    expect(found.failed.map((f) => f.path)).toEqual(["/notes.txt"]);
  });
});

describe("playFound", () => {
  const failed = (...paths: string[]) => paths.map((path) => ({ path, error: new Error("x") }));

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("plays what was found and warns about what couldn't be read", async () => {
    const found = { files: [file("a.mp4")], failed: failed("/x/gone.mp4") };
    expect(await playFound(found, "nothing")).toBe(true);
    expect(queued()).toEqual(["a.mp4"]);
    expect(toast.warning).toHaveBeenCalledWith("Couldn't open gone.mp4");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("names at most three unreadable items", async () => {
    const found = { files: [], failed: failed("/a", "C:\\v\\b", "/c", "/d") };
    expect(await playFound(found, "nothing")).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Couldn't open 4 items: a, b, c, …");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("says nothing was found when every path was read but held no video", async () => {
    expect(await playFound({ files: [], failed: [] }, "No videos found")).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("No videos found");
  });
});

describe("playRecent", () => {
  it("plays the refreshed file", async () => {
    tauri.getMediaInfo.mockResolvedValue({ ...file("r.mp4"), size: 42 });
    await playRecent(file("r.mp4"));
    expect(usePlaylistStore.getState().tracks[0].file.size).toBe(42);
  });

  it("reports a file that has gone instead of playing it", async () => {
    tauri.getMediaInfo.mockRejectedValue(new Error("gone"));
    await playRecent(file("gone.mp4"));
    expect(toast.error).toHaveBeenCalledWith("gone.mp4 was moved or deleted");
    expect(navigate).not.toHaveBeenCalled();
  });
});
