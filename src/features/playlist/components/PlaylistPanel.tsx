import { Play, Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { showInFolder } from "@/lib/tauri";
import { usePlaylistStore } from "../store";

export function PlaylistPanel({ className }: { className?: string }) {
  const tracks = usePlaylistStore((s) => s.tracks);
  const currentIndex = usePlaylistStore((s) => s.currentIndex);
  const jumpTo = usePlaylistStore((s) => s.jumpTo);
  const removeAt = usePlaylistStore((s) => s.removeAt);
  const clear = usePlaylistStore((s) => s.clear);

  return (
    <aside
      className={cn(
        "flex h-full w-80 flex-col border-l border-border bg-card/60 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Playlist</h2>
          <p className="text-xs text-muted-foreground">{tracks.length} items</p>
        </div>
        <Button variant="ghost" size="sm" onClick={clear} disabled={!tracks.length}>
          Clear
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <ul className="px-2 pb-2">
          {tracks.map((t, i) => (
            <li
              key={t.id}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent",
                i === currentIndex && "bg-accent text-accent-foreground",
              )}
            >
              <button
                className="flex flex-1 items-start gap-2 truncate text-left"
                onClick={() => jumpTo(i)}
              >
                <Play
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 flex-shrink-0",
                    i === currentIndex ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.file.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {formatBytes(t.file.size)} · {t.file.extension.toUpperCase()}
                  </div>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <IconButton
                  label="Show in folder"
                  size="icon-sm"
                  onClick={() => showInFolder(t.file.path)}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Remove" size="icon-sm" onClick={() => removeAt(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </li>
          ))}
          {tracks.length === 0 && (
            <li className="py-8 text-center text-xs text-muted-foreground">
              Queue is empty. Open files to add.
            </li>
          )}
        </ul>
      </ScrollArea>
    </aside>
  );
}
