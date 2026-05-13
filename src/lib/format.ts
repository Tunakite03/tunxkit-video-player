/**
 * Format seconds as `H:MM:SS` or `M:SS`.
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Format bytes into a human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}

/**
 * Format a relative time from a unix timestamp (seconds).
 */
export function formatRelative(unixSeconds?: number): string {
  if (!unixSeconds) return "";
  const diff = Date.now() / 1000 - unixSeconds;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return `${Math.floor(abs / 60)}m ago`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ago`;
  if (abs < 604800) return `${Math.floor(abs / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}
