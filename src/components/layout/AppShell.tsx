import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import { ShortcutsHelp } from "@/components/dialogs/ShortcutsHelp";

export function AppShell() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <ShortcutsHelp />
    </div>
  );
}
