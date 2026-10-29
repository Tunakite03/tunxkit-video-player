import * as React from "react";
import { FolderPlus, FilePlus, RefreshCw, Search, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/cn";
import { pickFolder, scanDirectory } from "@/lib/tauri";
import { useLibraryStore } from "../store";
import { useSettingsStore } from "@/features/settings/store";
import { openFiles, playFiles, warnTruncatedScan } from "@/features/playlist/open-media";
import { baseName } from "@/features/subtitles/tracks";
import { scrollRootOf } from "@/hooks/use-thumbnail";
import { LibraryCard } from "./LibraryCard";

/** Cards added to the grid at a time; more follow as the end scrolls into view. */
export const LIBRARY_PAGE_SIZE = 120;

/**
 * Calls `onVisible` when the element behind the returned ref is on screen (or within
 * 400px). A new `watch` value looks again, even if it never left the screen; null stops.
 */
function useOnVisible<T extends Element>(onVisible: () => void, watch: number | null) {
  const ref = React.useRef<T | null>(null);
  const callback = React.useRef(onVisible);
  React.useEffect(() => {
    callback.current = onVisible;
  }, [onVisible]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || watch === null) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) callback.current();
      },
      { root: scrollRootOf(el), rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [watch]);
  return ref;
}

export function LibraryView() {
  const folders = useLibraryStore((s) => s.folders);
  const items = useLibraryStore((s) => s.items);
  const loading = useLibraryStore((s) => s.loading);
  const query = useLibraryStore((s) => s.query);
  const setLoading = useLibraryStore((s) => s.setLoading);
  const setItems = useLibraryStore((s) => s.setItems);
  const setQuery = useLibraryStore((s) => s.setQuery);
  const addFolder = useLibraryStore((s) => s.addFolder);
  const removeFolder = useLibraryStore((s) => s.removeFolder);
  const scanRecursive = useSettingsStore((s) => s.scanRecursive);

  const scanKey = React.useMemo(
    () => JSON.stringify({ folders: folders.map((f) => f.path), recursive: scanRecursive }),
    [folders, scanRecursive],
  );

  const refresh = React.useCallback(async () => {
    if (!folders.length) {
      setItems([], scanKey);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        folders.map((f) => scanDirectory(f.path, scanRecursive)),
      );
      const failed = folders.filter((_, i) => results[i].status === "rejected");
      if (failed.length > 0) {
        console.warn("library folders could not be scanned", {
          folders: failed.map((f) => f.path),
          errors: results.flatMap((r) => (r.status === "rejected" ? [r.reason] : [])),
        });
        const names = failed.map((f) => baseName(f.path)).join(", ");
        toast.error(
          failed.length === 1
            ? `Couldn't scan the folder ${names}`
            : `Couldn't scan ${failed.length} folders: ${names}`,
          { description: "It may have been moved, renamed, or disconnected." },
        );
      }
      const scanned = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (scanned.some((r) => r.truncated)) warnTruncatedScan();
      const merged = scanned.flatMap((r) => r.files);
      const seen = new Set<string>();
      const unique = merged.filter((m) => (seen.has(m.path) ? false : seen.add(m.path)));
      setItems(unique, scanKey);
    } finally {
      setLoading(false);
    }
  }, [folders, scanKey, scanRecursive, setItems, setLoading]);

  // Items live in memory for the session, so only rescan when the folders or
  // options changed; the Refresh button forces a rescan.
  React.useEffect(() => {
    // Re-runs when a scan finishes, in case folders changed while it ran.
    if (!loading && useLibraryStore.getState().scannedKey !== scanKey) void refresh();
  }, [loading, refresh, scanKey]);

  const onAddFolder = async () => {
    const path = await pickFolder();
    if (path) {
      addFolder(path);
    }
  };

  const filtered = React.useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  // A library can hold tens of thousands of videos: render them a page at a time, and
  // start over from the first page whenever the list changes.
  const [shown, setShown] = React.useState({ list: filtered, count: LIBRARY_PAGE_SIZE });
  if (shown.list !== filtered) setShown({ list: filtered, count: LIBRARY_PAGE_SIZE });
  const hasMore = shown.count < filtered.length;
  const showMore = React.useCallback(
    () => setShown((s) => ({ ...s, count: s.count + LIBRARY_PAGE_SIZE })),
    [],
  );
  // Looks again after each page, so a page that leaves the end on screen loads the next.
  const endRef = useOnVisible<HTMLDivElement>(showMore, hasMore ? shown.count : null);
  const visible = filtered.slice(0, shown.count);

  return (
    <section className="flex h-full w-full min-w-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-6 py-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your library…"
            className="h-9 w-full rounded-md border border-border bg-input/40 pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring focus:bg-input/60"
          />
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            label="Refresh"
            size="icon-sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </IconButton>
          <Button variant="outline" size="sm" onClick={() => void openFiles()}>
            <FilePlus className="h-4 w-4" />
            Open files
          </Button>
          <Button variant="default" size="sm" onClick={onAddFolder}>
            <FolderPlus className="h-4 w-4" />
            Add folder
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border bg-surface/40 md:flex md:flex-col">
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Folders
          </div>
          <ScrollArea className="flex-1">
            <ul className="px-2 pb-2">
              {folders.map((f) => (
                <li
                  key={f.path}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate" title={f.path}>
                    {baseName(f.path)}
                  </span>
                  <IconButton
                    label="Remove"
                    size="icon-sm"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => removeFolder(f.path)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              ))}
              {folders.length === 0 && (
                <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No folders yet
                </li>
              )}
            </ul>
          </ScrollArea>
        </aside>

        <ScrollArea className="flex-1">
          <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((item, index) => (
              <LibraryCard
                key={item.path}
                item={item}
                onPlay={() => void playFiles(filtered, index)}
              />
            ))}
            {filtered.length === 0 && !loading && (
              <div className="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
                <FolderOpen className="h-10 w-10 opacity-50" />
                <p className="text-sm">
                  {folders.length === 0
                    ? "Add a folder to start building your library."
                    : "No videos match your search."}
                </p>
                {folders.length === 0 && (
                  <Button onClick={onAddFolder} size="sm">
                    <FolderPlus className="h-4 w-4" /> Add folder
                  </Button>
                )}
              </div>
            )}
          </div>
          {hasMore && <div ref={endRef} data-testid="library-more" className="h-px" aria-hidden />}
        </ScrollArea>
      </div>
    </section>
  );
}
