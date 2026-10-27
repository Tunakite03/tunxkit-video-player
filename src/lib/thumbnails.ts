import { toMediaSrc } from "./tauri";

/** A preview frame and the duration read while extracting it; either may be missing. */
export interface Thumbnail {
  dataUrl: string | null;
  duration: number | null;
}

interface QueueItem {
  path: string;
  resolve: (thumb: Thumbnail) => void;
}

const EMPTY: Thumbnail = { dataUrl: null, duration: null };
const CACHE = new Map<string, Thumbnail>();
const PENDING = new Map<string, Promise<Thumbnail>>();
const MAX_CACHE = 256;
const MAX_CONCURRENT = 2;
const queue: QueueItem[] = [];
let active = 0;

function setCache(path: string, thumb: Thumbnail) {
  if (CACHE.size >= MAX_CACHE) {
    const first = CACHE.keys().next().value;
    if (first) CACHE.delete(first);
  }
  CACHE.set(path, thumb);
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const item = queue.shift()!;
    active++;
    extractFrame(item.path)
      .then((thumb) => {
        // Failures are cached too, so a broken file isn't decoded again on every mount.
        setCache(item.path, thumb);
        item.resolve(thumb);
      })
      .catch(() => item.resolve(EMPTY))
      .finally(() => {
        active--;
        pump();
      });
  }
}

function extractFrame(path: string): Promise<Thumbnail> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.src = toMediaSrc(path);

    let settled = false;
    let duration: number | null = null;
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };
    const done = (dataUrl: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cleanup();
      resolve({ dataUrl, duration });
    };

    const timeout = window.setTimeout(() => done(null), 15000);

    video.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(video.duration)) duration = video.duration;
      const target = Math.min(Math.max(video.duration * 0.1, 1), 10);
      try {
        video.currentTime = isFinite(target) ? target : 0;
      } catch {
        done(null);
      }
    });

    video.addEventListener("seeked", () => {
      try {
        const w = 320;
        const ratio = video.videoHeight / video.videoWidth || 9 / 16;
        const h = Math.round(w * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return done(null);
        ctx.drawImage(video, 0, 0, w, h);
        done(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        done(null);
      }
    });

    video.addEventListener("error", () => done(null));
  });
}

export function getThumbnail(path: string): Promise<Thumbnail> {
  const cached = CACHE.get(path);
  if (cached) return Promise.resolve(cached);
  const pending = PENDING.get(path);
  if (pending) return pending;
  const promise = new Promise<Thumbnail>((resolve) => {
    queue.push({ path, resolve });
    pump();
  }).finally(() => {
    PENDING.delete(path);
  });
  PENDING.set(path, promise);
  return promise;
}

export function getCachedThumbnail(path: string): Thumbnail | undefined {
  return CACHE.get(path);
}
