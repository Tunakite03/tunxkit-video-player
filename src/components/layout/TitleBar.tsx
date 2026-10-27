import { Menu } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { usePlaylistStore, selectCurrentTrack } from "@/features/playlist/store";
import { useUIStore } from "@/stores/ui-store";

export function TitleBar() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const track = usePlaylistStore(selectCurrentTrack);

  return (
    <header className="drag-region flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card/40 px-2 backdrop-blur">
      <IconButton label="Toggle sidebar" size="icon-sm" onClick={toggleSidebar}>
        <Menu className="h-4 w-4" />
      </IconButton>
      <div className="min-w-0 flex-1 truncate px-2 text-center text-sm font-medium text-foreground/90">
        {track?.file.name ?? "Tunxkit Player"}
      </div>
      <div className="no-drag flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
