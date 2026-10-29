import { createBrowserRouter, RouterProvider } from "react-router-dom";
import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RouteError } from "@/components/layout/RouteError";

const HomePage = React.lazy(() =>
  import("@/pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const LibraryPage = React.lazy(() =>
  import("@/pages/LibraryPage").then((m) => ({ default: m.LibraryPage })),
);
const SettingsPage = React.lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

const wrap = (node: React.ReactNode) => (
  <React.Suspense fallback={<Loading />}>{node}</React.Suspense>
);

/** A page that fails to render shows the error inside the shell, sidebar still usable. */
const pageError = <RouteError />;

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    // The shell itself, the player it holds, or an unknown path.
    errorElement: (
      <div className="h-screen w-screen">
        <RouteError />
      </div>
    ),
    children: [
      { index: true, element: wrap(<HomePage />), errorElement: pageError },
      // AppShell draws the player itself and keeps it mounted across pages.
      { path: "player", element: null },
      { path: "library", element: wrap(<LibraryPage />), errorElement: pageError },
      { path: "settings", element: wrap(<SettingsPage />), errorElement: pageError },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
