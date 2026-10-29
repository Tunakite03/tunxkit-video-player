import * as React from "react";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { Providers } from "./providers";
import { AppRouter } from "./router";
import { useUIStore } from "@/stores/ui-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  announceLoaded,
  openFiles,
  openFolder,
  playFound,
  receiveOpenedFiles,
  scanPaths,
} from "@/features/playlist/open-media";
import { usePlaylistStore, selectCurrentTrack } from "@/features/playlist/store";
import { loadSubtitlePaths } from "@/features/subtitles/load";
import { subtitleFormat } from "@/features/subtitles/tracks";

/** Subscribe to a Tauri event for the component's lifetime; a no-op outside Tauri. */
function useTauriEvent<T>(event: string, handler: EventCallback<T>) {
  const ref = React.useRef(handler);
  React.useEffect(() => {
    ref.current = handler;
  }, [handler]);

  React.useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<T>(event, (e) => ref.current(e)).then(
      (stop) => {
        // The component may unmount before `listen` resolves.
        if (cancelled) stop();
        else unlisten = stop;
      },
      () => {
        /* not in tauri */
      },
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event]);
}

function GlobalShortcuts() {
  const openShortcuts = useUIStore((s) => s.openShortcuts);

  useKeyboardShortcuts((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
      e.preventDefault();
      void (e.shiftKey ? openFolder() : openFiles());
    }
    if (e.key === "?" || (e.shiftKey && e.key === "/")) {
      e.preventDefault();
      openShortcuts();
    }
  });
  return null;
}

/** Files opened from the OS: at launch, and while the app is already running. */
function OpenedMediaLoader() {
  React.useEffect(() => receiveOpenedFiles(), []);
  return null;
}

function DropZone() {
  useTauriEvent<{ paths: string[] }>("tauri://drag-drop", async (event) => {
    const paths = event.payload?.paths ?? [];
    if (!paths.length) return;
    // Subtitle files dropped while a video is loaded go to that video.
    const video = selectCurrentTrack(usePlaylistStore.getState())?.file;
    if (video && paths.every((p) => subtitleFormat(p) !== null)) {
      await loadSubtitlePaths(video, paths);
      return;
    }
    // Scanning handles both dropped files (filtered to videos) and folders.
    const found = await scanPaths(paths);
    if (await playFound(found, "No supported videos in the dropped items")) {
      announceLoaded(found.files.length);
    }
  });
  return null;
}

export function App() {
  return (
    <Providers>
      <GlobalShortcuts />
      <OpenedMediaLoader />
      <DropZone />
      <AppRouter />
    </Providers>
  );
}
