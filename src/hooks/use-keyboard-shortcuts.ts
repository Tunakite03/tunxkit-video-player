import * as React from "react";

type Handler = (e: KeyboardEvent) => void;

/**
 * Global key listener that skips events originating from form fields.
 * Pass a stable handler (use useCallback/useRef inside).
 */
export function useKeyboardShortcuts(handler: Handler, enabled = true) {
  const ref = React.useRef(handler);

  React.useEffect(() => {
    ref.current = handler;
  }, [handler]);

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable)
          return;
      }
      ref.current(e);
    };
    window.addEventListener("keydown", onKey, { signal: controller.signal });
    return () => controller.abort();
  }, [enabled]);
}
