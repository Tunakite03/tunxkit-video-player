import * as React from "react";
import { getThumbnail, getCachedThumbnail, type Thumbnail } from "@/lib/thumbnails";

/** Preview frame and duration for a video, generated once it is `enabled`. */
export function useThumbnail(path: string | null | undefined, enabled = true): Thumbnail | null {
  const cached = path && enabled ? (getCachedThumbnail(path) ?? null) : null;
  const [generated, setGenerated] = React.useState<Thumbnail | null>(null);

  React.useEffect(() => {
    if (!path || !enabled || cached) return;
    let cancelled = false;
    getThumbnail(path).then((t) => {
      if (!cancelled) setGenerated(t);
    });
    return () => {
      cancelled = true;
    };
  }, [path, enabled, cached]);

  return cached ?? generated;
}

export function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px", threshold: 0.01, ...options },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [options]);

  return { ref, inView };
}
