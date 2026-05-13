import * as React from "react";

/**
 * Returns true if no pointer activity (move / click) has happened for `delayMs`.
 * The container ref is the bounding region; pass the player wrapper.
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
    // Listen on the document while fullscreen is active. Some browsers dispatch
    // fullscreen pointer activity to the document before the element target,
    // which could leave the control bar hidden even after moving the mouse.
    const eventTarget: HTMLElement | Document =
      document.fullscreenElement === node ? document : node;
    eventTarget.addEventListener("mousemove", reset);
    eventTarget.addEventListener("pointermove", reset);
    eventTarget.addEventListener("mousedown", reset);
    eventTarget.addEventListener("pointerdown", reset);
    eventTarget.addEventListener("touchstart", reset);
    eventTarget.addEventListener("keydown", reset);
    document.addEventListener("fullscreenchange", reset);
    return () => {
      if (timer) window.clearTimeout(timer);
      eventTarget.removeEventListener("mousemove", reset);
      eventTarget.removeEventListener("pointermove", reset);
      eventTarget.removeEventListener("mousedown", reset);
      eventTarget.removeEventListener("pointerdown", reset);
      eventTarget.removeEventListener("touchstart", reset);
      eventTarget.removeEventListener("keydown", reset);
      document.removeEventListener("fullscreenchange", reset);
    };
  }, [containerRef, delayMs]);
  return idle;
}
