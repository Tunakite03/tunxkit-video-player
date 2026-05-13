import { toMediaSrc } from "./tauri";

interface QueueItem {
  path: string;
  resolve: (dataUrl: string | null) => void;
}

const CACHE = new Map<string, string>();
const PENDING = new Map<string, Promise<string | null>>();
const MAX_CACHE = 256;
const MAX_CONCURRENT = 2;
const queue: QueueItem[] = [];
let active = 0;

function setCache(path: string, dataUrl: string) {
  if (CACHE.size >= MAX_CACHE) {
    const first = CACHE.keys().next().value;
    if (first) CACHE.delete(first);
  }
  CACHE.set(path, dataUrl);
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const item = queue.shift()!;
    active++;
    extractFrame(item.path)
      .then((url) => {
        if (url) setCache(item.path, url);
        item.resolve(url);
      })
      .catch(() => item.resolve(null))
      .finally(() => {
        active--;
        pump();
      });
  }
}

function extractFrame(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.src = toMediaSrc(path);

    let settled = false;
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };
    const done = (url: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(url);
    };

    const timeout = window.setTimeout(() => done(null), 15000);

    video.addEventListener("loadedmetadata", () => {
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
        const url = canvas.toDataURL("image/jpeg", 0.7);
        window.clearTimeout(timeout);
        done(url);
      } catch {
        done(null);
      }
    });

    video.addEventListener("error", () => done(null));
  });
}

export function getThumbnail(path: string): Promise<string | null> {
  const cached = CACHE.get(path);
  if (cached) return Promise.resolve(cached);
  const pending = PENDING.get(path);
  if (pending) return pending;
  const promise = new Promise<string | null>((resolve) => {
    queue.push({ path, resolve });
    pump();
  }).finally(() => {
    PENDING.delete(path);
  });
  PENDING.set(path, promise);
  return promise;
}

export function getCachedThumbnail(path: string): string | undefined {
  return CACHE.get(path);
}
