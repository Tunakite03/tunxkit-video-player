import * as React from "react";
import { getThumbnail, getCachedThumbnail } from "@/lib/thumbnails";

export function useThumbnail(path: string | null | undefined, enabled = true) {
  const cachedUrl = path && enabled ? (getCachedThumbnail(path) ?? null) : null;
  const [generatedUrl, setGeneratedUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!path || !enabled || cachedUrl) return;
    let cancelled = false;
    getThumbnail(path).then((u) => {
      if (!cancelled) setGeneratedUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path, enabled, cachedUrl]);

  return cachedUrl ?? generatedUrl;
}

export function useInView<T extends Element>(
  options?: IntersectionObserverInit,
) {
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
