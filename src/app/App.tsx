import * as React from "react";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { Providers } from "./providers";
import { AppRouter } from "./router";
import { useUIStore } from "@/stores/ui-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { getStartupMediaFiles } from "@/lib/tauri";
import {
  announceLoaded,
  openFiles,
  openFolder,
  playFiles,
  scanPaths,
} from "@/features/playlist/open-media";
import { toast } from "sonner";
import type { MediaFile } from "@/types/media";

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

function StartupMediaLoader() {
  React.useEffect(() => {
    let cancelled = false;
    getStartupMediaFiles().then(
      async (files) => {
        if (!cancelled && (await playFiles(files))) announceLoaded(files.length);
      },
      () => {
        /* not in tauri */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Files opened from the OS while the app is already running.
  useTauriEvent<MediaFile[]>("open-files", (event) => void playFiles(event.payload ?? []));

  return null;
}

function DropZone() {
  useTauriEvent<{ paths: string[] }>("tauri://drag-drop", async (event) => {
    const paths = event.payload?.paths ?? [];
    if (!paths.length) return;
    // Scanning handles both dropped files (filtered to videos) and folders.
    const files = await scanPaths(paths);
    if (await playFiles(files)) announceLoaded(files.length);
    else toast.error("No supported videos in the dropped items");
  });
  return null;
}

export function App() {
  return (
    <Providers>
      <GlobalShortcuts />
      <StartupMediaLoader />
      <DropZone />
      <AppRouter />
    </Providers>
  );
}
