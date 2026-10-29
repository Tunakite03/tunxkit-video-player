import * as React from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}

/** What replaces a part of the app that failed to render. */
function ErrorView({ error }: { error: unknown }) {
  React.useEffect(() => {
    console.error("page failed to render", { error });
  }, [error]);

  return (
    <div
      role="alert"
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <TriangleAlert className="h-10 w-10 text-amber-400" />
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">{describe(error)}</p>
      {/* Reloading an unknown path would only show this again. */}
      {isRouteErrorResponse(error) ? (
        <Button size="sm" onClick={() => window.location.assign("/")}>
          Go to Home
        </Button>
      ) : (
        <Button size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      )}
    </div>
  );
}

/** Shown in place of a page, or of the whole app, that failed to render. */
export function RouteError() {
  return <ErrorView error={useRouteError()} />;
}

interface ErrorBoundaryState {
  failed: boolean;
  error: unknown;
}

/**
 * The same error screen for a part of the app that isn't a route of its own, such as
 * the player the shell keeps mounted. React only catches render errors in classes.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failed: true, error };
  }

  override render() {
    return this.state.failed ? <ErrorView error={this.state.error} /> : this.props.children;
  }
}
