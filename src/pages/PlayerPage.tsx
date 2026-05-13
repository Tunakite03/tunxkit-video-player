import { Player } from '@/features/player/components/Player'
import { PlaylistPanel } from '@/features/playlist/components/PlaylistPanel'
import { useUIStore } from '@/stores/ui-store'

export function PlayerPage() {
    const playlistOpen = useUIStore((s) => s.playlistOpen)
    return (
        <div className="flex h-full w-full">
            <div className="min-w-0 flex-1">
                <Player />
            </div>
            {playlistOpen && <PlaylistPanel />}
        </div>
    )
}
