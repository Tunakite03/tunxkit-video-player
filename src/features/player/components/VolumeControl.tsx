import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { IconButton } from "@/components/ui/icon-button";
import { usePlayerStore } from "../store";
import type { VideoController } from "../hooks/use-video-controller";

interface VolumeControlProps {
  controller: VideoController;
}

export function VolumeControl({ controller }: VolumeControlProps) {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="group/volume flex items-center rounded-full bg-white/10 pr-1 text-white transition-colors hover:bg-white/15">
      <IconButton
        label={muted ? "Unmute" : "Mute"}
        shortcut="M"
        size="icon"
        onClick={() => controller.toggleMute()}
        className="h-10 w-10 rounded-full text-white hover:bg-white/15 hover:text-white"
      >
        <VolumeIcon className="h-5 w-5" />
      </IconButton>
      <div className="-my-2 w-0 overflow-hidden py-2 transition-all duration-200 group-hover/volume:w-32 group-hover/volume:pl-2 group-hover/volume:pr-3 focus-within:w-32 focus-within:pl-2 focus-within:pr-3">
        <Slider
          value={[muted ? 0 : volume * 100]}
          max={100}
          step={1}
          onValueChange={([v]) => controller.setVolume(v / 100)}
          size="md"
          aria-label="Volume"
          className="px-2"
          thumbClassName="opacity-0 group-hover/volume:opacity-100 focus:opacity-100"
        />
      </div>
    </div>
  );
}
