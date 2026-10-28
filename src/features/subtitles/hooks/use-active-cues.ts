import * as React from "react";
import { cuesAt, parseCueText, type SubtitleCue } from "../parse";
import type { CueListTrack, SubtitleTrack } from "../store";

const NO_CUES: readonly SubtitleCue[] = [];

const sameCues = (a: readonly SubtitleCue[], b: readonly SubtitleCue[]) =>
  a.length === b.length && a.every((cue, i) => cue === b[i]);

/** Webview cues converted once each, so an unchanged set keeps its identity. */
const convertedCues = new WeakMap<TextTrackCue, SubtitleCue | null>();

function fromTextTrackCue(cue: TextTrackCue): SubtitleCue | null {
  let converted = convertedCues.get(cue);
  if (converted === undefined) {
    // VTTCue (and WebKit's cues for in-band text) carry their text with VTT markup.
    const text = "text" in cue && typeof cue.text === "string" ? cue.text : "";
    const lines = parseCueText(text);
    converted = lines.length > 0 ? { start: cue.startTime, end: cue.endTime, lines } : null;
    convertedCues.set(cue, converted);
  }
  return converted;
}

function webviewActiveCues(textTrack: TextTrack): SubtitleCue[] {
  const active: SubtitleCue[] = [];
  const list = textTrack.activeCues;
  for (let i = 0; list && i < list.length; i++) {
    const cue = fromTextTrackCue(list[i]);
    if (cue) active.push(cue);
  }
  return active;
}

/**
 * Follow `video` and report changes of a cue-list track. While playing it checks
 * every animation frame: `timeupdate` alone fires ~4 times a second, which would show
 * and hide lines up to a quarter second late.
 */
function followPlayback(video: HTMLVideoElement, onChange: () => void): () => void {
  let frame: number | null = null;
  const tick = () => {
    onChange();
    frame = window.requestAnimationFrame(tick);
  };
  const start = () => {
    if (frame === null) frame = window.requestAnimationFrame(tick);
  };
  const stop = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    onChange();
  };
  const events: [keyof HTMLMediaElementEventMap, () => void][] = [
    ["playing", start],
    ["pause", stop],
    ["ended", stop],
    ["waiting", stop],
    ["emptied", stop],
    ["seeked", onChange],
    ["timeupdate", onChange],
  ];
  for (const [name, fn] of events) video.addEventListener(name, fn);
  if (!video.paused) start();
  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    for (const [name, fn] of events) video.removeEventListener(name, fn);
  };
}

/**
 * The cues of `track` showing now. Cue lists are matched against the video's time;
 * webview tracks report their own active cues. Re-renders only on a change.
 */
export function useActiveCues(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  track: SubtitleTrack | null,
): readonly SubtitleCue[] {
  // Holds the last snapshot so an unchanged set of cues keeps its identity.
  const snapshot = React.useRef(NO_CUES);

  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (track?.source === "inband") {
        const { textTrack } = track;
        textTrack.addEventListener("cuechange", onChange);
        return () => textTrack.removeEventListener("cuechange", onChange);
      }
      const video = videoRef.current;
      if (!video || !track || track.cues.length === 0) return () => {};
      return followPlayback(video, onChange);
    },
    [videoRef, track],
  );

  const getSnapshot = React.useCallback(() => {
    let next: readonly SubtitleCue[] = NO_CUES;
    if (track?.source === "inband") {
      next = webviewActiveCues(track.textTrack);
    } else if (track) {
      const video = videoRef.current;
      if (video) next = cuesAt((track as CueListTrack).cues, video.currentTime);
    }
    if (!sameCues(snapshot.current, next)) snapshot.current = next;
    return snapshot.current;
  }, [videoRef, track]);

  return React.useSyncExternalStore(subscribe, getSnapshot);
}
