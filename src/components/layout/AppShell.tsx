import * as React from "react";
import { Outlet, useMatch } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import { ShortcutsHelp } from "@/components/dialogs/ShortcutsHelp";
import { ErrorBoundary } from "./RouteError";

const PlayerPage = React.lazy(() =>
  import("@/pages/PlayerPage").then((m) => ({ default: m.PlayerPage })),
);

export function AppShell() {
  const onPlayer = useMatch("/player") !== null;
  // Mounted on the first visit and kept from then on: unmounting it would destroy the
  // <video>, stopping playback whenever another page opens.
  const [playerMounted, setPlayerMounted] = React.useState(onPlayer);
  if (onPlayer && !playerMounted) setPlayerMounted(true);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1">
          {/* Its own boundary, as for a page: a failing player leaves the shell usable. */}
          {playerMounted && (
            <div className={onPlayer ? "contents" : "hidden"}>
              <ErrorBoundary>
                <React.Suspense fallback={null}>
                  <PlayerPage active={onPlayer} />
                </React.Suspense>
              </ErrorBoundary>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <ShortcutsHelp />
    </div>
  );
}
