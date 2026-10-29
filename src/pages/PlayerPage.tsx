import * as React from "react";
import { Player } from "@/features/player/components/Player";
import { PlaylistPanel } from "@/features/playlist/components/PlaylistPanel";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/stores/ui-store";

interface PlayerPageProps {
  /**
   * Whether the page is on screen. The app shell keeps it mounted, hidden, while
   * another page shows, so leaving the player doesn't stop or reload the video.
   */
  active: boolean;
}

export function PlayerPage({ active }: PlayerPageProps) {
  const playlistOpen = useUIStore((s) => s.playlistOpen);
  // The whole page goes fullscreen, so the playlist can still be opened there.
  const pageRef = React.useRef<HTMLDivElement>(null);
  return (
    <div ref={pageRef} className={cn("flex h-full w-full bg-background", !active && "hidden")}>
      <div className="min-w-0 flex-1">
        <Player fullscreenTargetRef={pageRef} active={active} />
      </div>
      {playlistOpen && <PlaylistPanel />}
    </div>
  );
}
