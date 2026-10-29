/**
 * Checks for state read back from localStorage. What is stored there may come from an
 * older version or have been edited by hand, so stores restore only values that pass,
 * rebuilt without unknown fields, and keep their defaults for the rest.
 */
import type { MediaFile } from "@/types/media";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A stored media file, or null when it isn't one. */
export function toMediaFile(value: unknown): MediaFile | null {
  if (!isRecord(value)) return null;
  const { path, name, size, extension, modified } = value;
  if (typeof path !== "string" || path === "" || typeof name !== "string") return null;
  if (!isFiniteNumber(size) || typeof extension !== "string") return null;
  // The backend sends a missing modification time as null.
  return isFiniteNumber(modified)
    ? { path, name, size, extension, modified }
    : { path, name, size, extension };
}
