import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MediaFile, ScanResult } from "@/types/media";
import { useLibraryStore } from "../store";
import { LIBRARY_PAGE_SIZE, LibraryView } from "./LibraryView";

const scanDirectory = vi.hoisted(() => vi.fn<(path: string) => Promise<ScanResult>>());
vi.mock("@/lib/tauri", () => ({
  scanDirectory,
  pickFolder: vi.fn(),
  showInFolder: vi.fn(),
  toMediaSrc: (path: string) => `asset://${path}`,
}));
vi.mock("@/features/playlist/open-media", () => ({
  openFiles: vi.fn(),
  playFiles: vi.fn(),
  warnTruncatedScan: vi.fn(),
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

/** Stand-in for IntersectionObserver, which happy-dom lacks; tests decide what is on screen. */
class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = [];
  targets: Element[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly root: Element | Document | null;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = options?.root ?? null;
    FakeIntersectionObserver.all.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    this.targets = [];
  }
  takeRecords() {
    return [];
  }
}

function scrollIntoView(el: Element) {
  for (const observer of FakeIntersectionObserver.all.filter((o) => o.targets.includes(el))) {
    const entry = { isIntersecting: true, target: el } as IntersectionObserverEntry;
    act(() => observer.callback([entry], observer as unknown as IntersectionObserver));
  }
}

const videos = (count: number, folder: string): MediaFile[] =>
  Array.from({ length: count }, (_, i) => ({
    path: `${folder}/v${String(i).padStart(4, "0")}.mp4`,
    name: `v${String(i).padStart(4, "0")}.mp4`,
    size: 1,
    extension: "mp4",
  }));

const cards = () => screen.queryAllByText(/^v\d{4}\.mp4$/).length;

beforeEach(() => {
  FakeIntersectionObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  useLibraryStore.setState(useLibraryStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderLibrary(folders: string[]) {
  useLibraryStore.setState({ folders: folders.map((path) => ({ path, addedAt: 0 })) });
  render(
    <TooltipProvider>
      <LibraryView />
    </TooltipProvider>,
  );
}

describe("LibraryView", () => {
  it("renders a large library a page at a time as the end scrolls into view", async () => {
    scanDirectory.mockResolvedValue({ files: videos(300, "/movies"), truncated: false });
    renderLibrary(["/movies"]);
    await waitFor(() => expect(cards()).toBe(LIBRARY_PAGE_SIZE));
    // Watched within the scroll area, whose viewport clips the grid.
    const more = screen.getByTestId("library-more");
    const watcher = FakeIntersectionObserver.all.find((o) => o.targets.includes(more));
    expect(watcher?.root).toBe(more.closest("[data-radix-scroll-area-viewport]"));
    expect(watcher?.root).not.toBeNull();

    scrollIntoView(screen.getByTestId("library-more"));
    expect(cards()).toBe(2 * LIBRARY_PAGE_SIZE);
    scrollIntoView(screen.getByTestId("library-more"));
    expect(cards()).toBe(300);
    expect(screen.queryByTestId("library-more")).toBeNull();
  });

  it("reports folders it couldn't scan and still shows the others", async () => {
    scanDirectory.mockImplementation((path) =>
      path === "/gone/Old Drive"
        ? Promise.reject(new Error("invalid path"))
        : Promise.resolve({ files: videos(2, path), truncated: false }),
    );
    renderLibrary(["/movies", "/gone/Old Drive"]);
    await waitFor(() => expect(cards()).toBe(2));
    expect(toastError).toHaveBeenCalledOnce();
    expect(toastError.mock.calls[0][0]).toBe("Couldn't scan the folder Old Drive");
  });
});
