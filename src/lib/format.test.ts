import { describe, expect, it } from "vitest";
import { formatBytes, formatTime } from "./format";

describe("formatTime", () => {
  it.each([
    [0, "0:00"],
    [5.9, "0:05"],
    [65, "1:05"],
    [3600, "1:00:00"],
    [3725, "1:02:05"],
    [-1, "0:00"],
    [Number.NaN, "0:00"],
    [Number.POSITIVE_INFINITY, "0:00"],
  ])("%s → %s", (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1536, "1.50 KB"],
    [15 * 1024 * 1024, "15.0 MB"],
    [300 * 1024 ** 3, "300 GB"],
    [-5, "0 B"],
  ])("%s → %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
