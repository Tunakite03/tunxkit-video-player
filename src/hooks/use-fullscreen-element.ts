import * as React from "react";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

const getFullscreenElement = (): Element | null => document.fullscreenElement;

/**
 * The element currently shown fullscreen, or null. In fullscreen only that element's
 * subtree is painted, so popups must be portaled into it instead of `document.body`.
 */
export function useFullscreenElement(): Element | null {
  return React.useSyncExternalStore(subscribe, getFullscreenElement);
}
