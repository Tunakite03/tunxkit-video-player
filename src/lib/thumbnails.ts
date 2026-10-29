import { toMediaSrc } from "./tauri";

/** A preview frame and the duration read while extracting it; either may be missing. */
export interface Thumbnail {
  dataUrl: string | null;
  duration: number | null;
}

interface QueueItem {
  path: string;
  /** Callers still waiting. At zero an item that hasn't started is dropped undecoded. */
  waiters: number;
  resolve: (thumb: Thumbnail) => void;
}

interface Pending {
  item: QueueItem;
  promise: Promise<Thumbnail>;
}

const EMPTY: Thumbnail = { dataUrl: null, duration: null };
const CACHE = new Map<string, Thumbnail>();
const PENDING = new Map<string, Pending>();
const MAX_CACHE = 256;
const MAX_CONCURRENT = 2;
/** Waiting requests, oldest first. The newest starts first: it's what just scrolled into view. */
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
    const item = queue.pop()!;
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

/**
 * Preview frame for `path`, decoded at most once. Aborting `signal` withdraws this
 * caller; a request nobody waits for any more is dropped (resolving empty, uncached)
 * if its decode hasn't started.
 */
export function getThumbnail(path: string, signal?: AbortSignal): Promise<Thumbnail> {
  const cached = CACHE.get(path);
  if (cached) return Promise.resolve(cached);
  if (signal?.aborted) return Promise.resolve(EMPTY);
  let pending = PENDING.get(path);
  if (!pending) {
    let resolve: (thumb: Thumbnail) => void = () => {};
    const promise = new Promise<Thumbnail>((r) => (resolve = r)).finally(() => {
      PENDING.delete(path);
    });
    pending = { item: { path, waiters: 0, resolve }, promise };
    PENDING.set(path, pending);
    queue.push(pending.item);
  }
  const { item } = pending;
  item.waiters++;
  signal?.addEventListener(
    "abort",
    () => {
      item.waiters--;
      const index = queue.indexOf(item);
      if (item.waiters === 0 && index >= 0) {
        queue.splice(index, 1);
        // Forget it now, not when the promise settles: a request for the same path
        // in the meantime must queue afresh rather than share this empty result.
        PENDING.delete(path);
        item.resolve(EMPTY);
      }
    },
    { once: true },
  );
  pump();
  return pending.promise;
}

export function getCachedThumbnail(path: string): Thumbnail | undefined {
  return CACHE.get(path);
}
