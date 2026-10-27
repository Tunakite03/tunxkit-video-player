import { useNavigate } from "react-router-dom";
import { FolderPlus, FilePlus, Clock, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes, formatRelative } from "@/lib/format";
import { pickFolder } from "@/lib/tauri";
import { useLibraryStore } from "@/features/library/store";
import { usePlaylistStore } from "@/features/playlist/store";
import { openFiles, playRecent } from "@/features/playlist/open-media";

export function HomePage() {
  const navigate = useNavigate();
  const recent = usePlaylistStore((s) => s.recent);
  const addFolder = useLibraryStore((s) => s.addFolder);

  const addLibraryFolder = async () => {
    const p = await pickFolder();
    if (p) {
      addFolder(p);
      navigate("/library");
    }
  };

  return (
    <ScrollArea className="h-full w-full">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="mb-10 flex flex-col items-start gap-4">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
            Welcome
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">Watch anything, beautifully.</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Tunxkit Player is a fast, native, distraction-free video player for your local files.
            Open a video to start, or add a folder to build your library.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void openFiles()}>
              <FilePlus className="h-4 w-4" />
              Open videos
            </Button>
            <Button variant="outline" onClick={addLibraryFolder}>
              <FolderPlus className="h-4 w-4" />
              Add folder to library
            </Button>
          </div>
        </div>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent
            </h2>
          </div>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              Files you watch will appear here.
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recent.slice(0, 12).map((file) => (
                <li key={file.path}>
                  <button
                    onClick={() => void playRecent(file)}
                    className="group flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-pop"
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                      <PlayCircle className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{file.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatBytes(file.size)}
                        {file.modified ? ` · ${formatRelative(file.modified)}` : ""}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
