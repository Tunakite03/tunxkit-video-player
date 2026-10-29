import * as React from "react";
import { getThumbnail, getCachedThumbnail, type Thumbnail } from "@/lib/thumbnails";

/** Preview frame and duration for a video, generated once it is `enabled`. */
export function useThumbnail(path: string | null | undefined, enabled = true): Thumbnail | null {
  const cached = path && enabled ? (getCachedThumbnail(path) ?? null) : null;
  const [generated, setGenerated] = React.useState<Thumbnail | null>(null);

  React.useEffect(() => {
    if (!path || !enabled || cached) return;
    // Aborting withdraws the request, so a card scrolled past before its turn
    // doesn't hold up the ones on screen.
    const controller = new AbortController();
    getThumbnail(path, controller.signal).then((t) => {
      if (!controller.signal.aborted) setGenerated(t);
    });
    return () => controller.abort();
  }, [path, enabled, cached]);

  return cached ?? generated;
}

/**
 * The scroll area viewport holding `el`, or null for the window. Observers need it as
 * their root: the viewport clips its content, so a margin around the window would
 * never see anything just outside the scroll area's visible part.
 */
export function scrollRootOf(el: Element): Element | null {
  return el.closest("[data-radix-scroll-area-viewport]");
}

/** Whether the element is on screen (or within 200px of it), kept current while scrolling. */
export function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setInView(last.isIntersecting);
      },
      { root: scrollRootOf(el), rootMargin: "200px", threshold: 0.01, ...options },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [options]);

  return { ref, inView };
}
