import { Captions, CaptionsOff, Check, FileText } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { useSubtitleStore } from "../store";
import { openSubtitleFiles } from "../load";

/** Player control: pick a subtitle track, turn subtitles off, or load a file. */
export function SubtitleMenu() {
  const tracks = useSubtitleStore((s) => s.tracks);
  const activeTrackId = useSubtitleStore((s) => s.activeTrackId);
  const select = useSubtitleStore((s) => s.select);
  const on = activeTrackId !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label={on ? "Subtitles: on" : "Subtitles: off"}
          shortcut="C"
          size="icon"
          data-test="subtitle-menu"
          className={cn(
            "h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white",
            on && "text-primary",
          )}
        >
          {on ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-72">
        <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <TrackItem label="Off" selected={!on} onSelect={() => select(null)} />
        {tracks.map((track) => (
          <TrackItem
            key={track.id}
            label={track.label}
            hint={track.hint}
            title={track.source === "file" ? track.id : undefined}
            selected={track.id === activeTrackId}
            onSelect={() => select(track.id)}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void openSubtitleFiles()} className="gap-2">
          <FileText className="h-4 w-4 shrink-0" />
          Load subtitle file…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TrackItemProps {
  label: string;
  hint?: string;
  title?: string;
  selected: boolean;
  onSelect: () => void;
}

function TrackItem({ label, hint, title, selected, onSelect }: TrackItemProps) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      title={title}
      className={cn("gap-2", selected && "text-primary")}
    >
      <Check className={cn("h-4 w-4 shrink-0", !selected && "invisible")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </DropdownMenuItem>
  );
}
