import * as React from "react";
import { Player } from "@/features/player/components/Player";
import { PlaylistPanel } from "@/features/playlist/components/PlaylistPanel";
import { useUIStore } from "@/stores/ui-store";

export function PlayerPage() {
  const playlistOpen = useUIStore((s) => s.playlistOpen);
  // The whole page goes fullscreen, so the playlist can still be opened there.
  const pageRef = React.useRef<HTMLDivElement>(null);
  return (
    <div ref={pageRef} className="flex h-full w-full bg-background">
      <div className="min-w-0 flex-1">
        <Player fullscreenTargetRef={pageRef} />
      </div>
      {playlistOpen && <PlaylistPanel />}
    </div>
  );
}
