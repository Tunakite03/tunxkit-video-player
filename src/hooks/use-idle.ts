import * as React from "react";

/**
 * Returns true if no cursor/pointer/keyboard activity has happened for `delayMs`.
 * The container ref is the bounding region for pointer activity; pass the player wrapper.
 * Key presses anywhere in the window count as activity, since shortcuts are global.
 */
export function useIdle(
  containerRef: React.RefObject<HTMLElement | null>,
  delayMs = 2500,
): boolean {
  const [idle, setIdle] = React.useState(false);
  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    let timer: number | undefined;
    const reset = () => {
      setIdle(false);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), delayMs);
    };
    reset();
    // Pointer events inside the wrapper bubble to it, including in fullscreen
    // (the wrapper sits inside the fullscreen element).
    const pointerEvents = ["pointermove", "pointerdown", "touchstart", "wheel"] as const;
    for (const name of pointerEvents) node.addEventListener(name, reset);
    window.addEventListener("keydown", reset);
    document.addEventListener("fullscreenchange", reset);
    return () => {
      if (timer) window.clearTimeout(timer);
      for (const name of pointerEvents) node.removeEventListener(name, reset);
      window.removeEventListener("keydown", reset);
      document.removeEventListener("fullscreenchange", reset);
    };
  }, [containerRef, delayMs]);
  return idle;
}
