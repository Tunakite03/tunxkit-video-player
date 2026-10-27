import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize,
  Minimize,
  PictureInPicture2,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  Gauge,
} from "lucide-react";
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
import { usePlayerStore } from "../store";
import { usePlaylistStore } from "@/features/playlist/store";
import { useUIStore } from "@/stores/ui-store";
import { SeekBar } from "./SeekBar";
import { VolumeControl } from "./VolumeControl";
import type { VideoController } from "../hooks/use-video-controller";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface PlayerControlsProps {
  controller: VideoController;
  onToggleFullscreen: () => void;
  onPrevious: () => void;
  visible: boolean;
}

export function PlayerControls({
  controller,
  onToggleFullscreen,
  onPrevious,
  visible,
}: PlayerControlsProps) {
  const paused = usePlayerStore((s) => s.paused);
  const isFullscreen = usePlayerStore((s) => s.isFullscreen);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const shuffle = usePlaylistStore((s) => s.shuffle);
  const repeat = usePlaylistStore((s) => s.repeat);
  const toggleShuffle = usePlaylistStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlaylistStore((s) => s.cycleRepeat);
  const next = usePlaylistStore((s) => s.next);
  const togglePlaylist = useUIStore((s) => s.togglePlaylist);

  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col px-5 pb-5 pt-20 text-white ",
        " transition-all duration-200",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <div className="pointer-events-auto">
        <SeekBar controller={controller} />
      </div>
      <div className="pointer-events-auto mt-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <VolumeControl controller={controller} />
        </div>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <IconButton
            label="Shuffle"
            size="icon"
            onClick={toggleShuffle}
            className={cn(
              "h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white",
              shuffle && "text-primary",
            )}
          >
            <Shuffle className="h-5 w-5" />
          </IconButton>
          <IconButton
            label="Previous"
            shortcut="Shift+P"
            size="icon"
            onClick={onPrevious}
            className="h-11 w-11 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <SkipBack className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={paused ? "Play" : "Pause"}
            shortcut="Space"
            size="icon-lg"
            onClick={() => controller.togglePlay()}
            className="h-12 w-12 rounded-full bg-white/15 text-white shadow-lg ring-1 ring-white/15 hover:bg-white/25 hover:text-white"
          >
            {paused ? <Play className="h-6 w-6" /> : <Pause className="h-6 w-6" />}
          </IconButton>
          <IconButton
            label="Next"
            shortcut="Shift+N"
            size="icon"
            onClick={() => next()}
            className="h-11 w-11 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <SkipForward className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={`Repeat: ${repeat}`}
            size="icon"
            onClick={cycleRepeat}
            className={cn(
              "h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white",
              repeat !== "off" && "text-primary",
            )}
          >
            <RepeatIcon className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="flex items-center gap-2 flex-1 justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                label={`Speed: ${playbackRate}×`}
                size="icon"
                className="h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Gauge className="h-5 w-5" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {RATES.map((r) => (
                <DropdownMenuItem
                  key={r}
                  onSelect={() => controller.setRate(r)}
                  className={cn(playbackRate === r && "text-primary")}
                >
                  {r}× {r === 1 && "(Normal)"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <IconButton
            label="Playlist"
            shortcut="Q"
            size="icon"
            onClick={togglePlaylist}
            className="h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <ListMusic className="h-5 w-5" />
          </IconButton>
          <IconButton
            label="Picture-in-Picture"
            shortcut="P"
            size="icon"
            onClick={() => controller.requestPiP()}
            className="h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <PictureInPicture2 className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            shortcut="F"
            size="icon"
            onClick={onToggleFullscreen}
            className="h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
