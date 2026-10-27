import { Play, FolderOpen } from "lucide-react";
import type { MediaFile } from "@/types/media";
import { IconButton } from "@/components/ui/icon-button";
import { formatBytes, formatRelative, formatTime } from "@/lib/format";
import { showInFolder } from "@/lib/tauri";
import { useThumbnail, useInView } from "@/hooks/use-thumbnail";
import { cn } from "@/lib/cn";

interface LibraryCardProps {
  item: MediaFile;
  onPlay: () => void;
}

export function LibraryCard({ item, onPlay }: LibraryCardProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const thumbnail = useThumbnail(item.path, inView);
  const thumb = thumbnail?.dataUrl;
  const duration = thumbnail?.duration ?? null;

  return (
    // The folder button sits beside the play button rather than inside it: nested buttons are invalid.
    <div ref={ref} className="group relative transition-transform hover:-translate-y-0.5">
      <button
        onClick={onPlay}
        className="flex w-full flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-soft transition-all hover:border-primary/50 hover:shadow-pop"
      >
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-brand-700 to-brand-900 text-white/80">
          {thumb && (
            <img
              src={thumb}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          )}
          <Play
            className={cn(
              "relative h-8 w-8 drop-shadow-md transition-transform group-hover:scale-110",
              thumb && "opacity-0 group-hover:opacity-100",
            )}
          />
          <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
            {item.extension}
          </span>
          {duration !== null && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
              {formatTime(duration)}
            </span>
          )}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-sm font-medium leading-tight">{item.name}</span>
          <span className="text-[11px] text-muted-foreground">
            {formatBytes(item.size)}
            {item.modified ? ` · ${formatRelative(item.modified)}` : ""}
          </span>
        </div>
      </button>
      <IconButton
        label="Show in folder"
        size="icon-sm"
        onClick={() => void showInFolder(item.path)}
        className="absolute right-4 top-4 bg-card/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <FolderOpen className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}
