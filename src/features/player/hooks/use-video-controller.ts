import * as React from "react";
import { usePlayerStore } from "../store";

const DEFAULT_FRAME_SECONDS = 1 / 30;
/**
 * Shortest gap between frame-driven progress updates (~30 per second). Without it a
 * 120 Hz display re-renders the seek bar 120 times a second while a video plays.
 */
const LIVE_PROGRESS_INTERVAL_MS = 30;

/**
 * Start playback. A play() cut short by a pause or a new source rejects with an
 * AbortError, which is expected; anything else is logged. A source that can't play
 * also fires `error`, which the player shows.
 */
export function startPlayback(video: HTMLVideoElement): void {
  video.play().catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.warn("playback did not start", { src: video.currentSrc, error });
  });
}

/** Fraction (0..1) of the media buffered around the current playback position. */
function bufferedFraction(video: HTMLVideoElement): number {
  const { buffered, duration, currentTime } = video;
  if (!(duration > 0) || !Number.isFinite(duration) || buffered.length === 0) return 0;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
      return buffered.end(i) / duration;
    }
  }
  return buffered.end(buffered.length - 1) / duration;
}

/**
 * Wires an HTMLVideoElement to the player store. Returns helper controls.
 * Intentionally a thin layer — the source of truth for state is the video element itself.
 * The video element must be mounted for the whole lifetime of the component using this hook.
 * `liveProgress`: whether the progress bar is on screen and should follow every frame;
 * otherwise `timeupdate` alone keeps the stored time current.
 */
export function useVideoController(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  liveProgress: boolean,
) {
  const setPaused = usePlayerStore((s) => s.setPaused);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setBuffered = usePlayerStore((s) => s.setBuffered);
  const setVolumeState = usePlayerStore((s) => s.setVolume);
  const setMuted = usePlayerStore((s) => s.setMuted);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  /** Shortest gap between presented frames seen for the current source, in seconds. */
  const learnedFrameRef = React.useRef(Infinity);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPaused(false);
    const onPause = () => {
      setPaused(true);
      setCurrentTime(video.currentTime);
    };
    const onTime = () => {
      setCurrentTime(video.currentTime);
      setBuffered(bufferedFraction(video));
    };
    const onDur = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onProg = () => setBuffered(bufferedFraction(video));
    const onEmptied = () => {
      setPaused(true);
      setCurrentTime(0);
      setDuration(0);
      setBuffered(0);
    };
    const onVol = () => {
      setVolumeState(video.volume);
      setMuted(video.muted);
    };
    const onRate = () => setPlaybackRate(video.playbackRate);

    // Learn the frame duration from presented frames so frame stepping matches the
    // video's real fps. The smallest gap wins: above 1× speed frames get skipped.
    let frameCallback: number | null = null;
    let lastMediaTime: number | null = null;
    const onFrame: VideoFrameRequestCallback = (_now, meta) => {
      if (lastMediaTime !== null) {
        const gap = meta.mediaTime - lastMediaTime;
        if (gap > 0.004 && gap < 0.5 && gap < learnedFrameRef.current)
          learnedFrameRef.current = gap;
      }
      lastMediaTime = meta.mediaTime;
      frameCallback = video.requestVideoFrameCallback(onFrame);
    };
    const supportsFrameCallback = "requestVideoFrameCallback" in video;
    if (supportsFrameCallback) frameCallback = video.requestVideoFrameCallback(onFrame);
    const onSourceChange = () => {
      learnedFrameRef.current = Infinity;
      lastMediaTime = null;
    };
    // Seeking jumps mediaTime, so don't measure a gap across it.
    const onSeeking = () => {
      lastMediaTime = null;
      onTime();
    };

    const events: [keyof HTMLMediaElementEventMap, () => void][] = [
      ["play", onPlay],
      ["playing", onPlay],
      ["pause", onPause],
      ["ended", onPause],
      ["timeupdate", onTime],
      ["seeking", onSeeking],
      ["loadstart", onSourceChange],
      ["seeked", onTime],
      ["loadedmetadata", onDur],
      ["durationchange", onDur],
      ["progress", onProg],
      ["emptied", onEmptied],
      ["volumechange", onVol],
      ["ratechange", onRate],
    ];
    for (const [name, fn] of events) video.addEventListener(name, fn);

    // Sync with whatever state the element is already in. Volume goes the other
    // way: a fresh element reports 1, which would overwrite the stored volume.
    onDur();
    onTime();
    const { volume, muted } = usePlayerStore.getState();
    video.volume = volume;
    video.muted = muted;
    setPaused(video.paused);

    return () => {
      if (supportsFrameCallback && frameCallback !== null)
        video.cancelVideoFrameCallback(frameCallback);
      for (const [name, fn] of events) video.removeEventListener(name, fn);
    };
  }, [
    videoRef,
    setPaused,
    setDuration,
    setCurrentTime,
    setBuffered,
    setVolumeState,
    setMuted,
    setPlaybackRate,
  ]);

  // `timeupdate` only fires ~4 times per second, so while the progress bar is on
  // screen drive it from animation frames to keep it in step with the picture.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !liveProgress) return;
    let frame: number | null = null;
    let lastUpdate = -Infinity;
    const tick = (now: number) => {
      if (now - lastUpdate >= LIVE_PROGRESS_INTERVAL_MS) {
        lastUpdate = now;
        setCurrentTime(video.currentTime);
      }
      frame = window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame === null) frame = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
    const events: [keyof HTMLMediaElementEventMap, () => void][] = [
      ["playing", start],
      ["pause", stop],
      ["ended", stop],
      ["waiting", stop],
      ["emptied", stop],
    ];
    for (const [name, fn] of events) video.addEventListener(name, fn);
    if (!video.paused) start();
    return () => {
      stop();
      for (const [name, fn] of events) video.removeEventListener(name, fn);
    };
  }, [videoRef, liveProgress, setCurrentTime]);

  const controls = React.useMemo(() => {
    const seekTo = (t: number) => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(v.duration)) return;
      const target = Math.max(0, Math.min(v.duration, t));
      v.currentTime = target;
      // Reflect the new position right away so the seek bar doesn't snap back
      // to the old time while the element is still seeking.
      setCurrentTime(target);
    };
    return {
      togglePlay: () => {
        const v = videoRef.current;
        if (!v || !v.currentSrc) return;
        if (v.paused || v.ended) startPlayback(v);
        else v.pause();
      },
      play: () => {
        const v = videoRef.current;
        if (v) startPlayback(v);
      },
      pause: () => videoRef.current?.pause(),
      seekTo,
      seekBy: (delta: number) => {
        const v = videoRef.current;
        if (!v) return;
        seekTo(v.currentTime + delta);
      },
      /** Pause and move one frame; falls back to 30 fps until a frame rate is learned. */
      stepFrame: (direction: 1 | -1) => {
        const v = videoRef.current;
        if (!v) return;
        v.pause();
        const frame = Number.isFinite(learnedFrameRef.current)
          ? learnedFrameRef.current
          : DEFAULT_FRAME_SECONDS;
        seekTo(v.currentTime + direction * frame);
      },
      restart: () => {
        const v = videoRef.current;
        if (!v || !v.currentSrc) return;
        seekTo(0);
        startPlayback(v);
      },
      setVolume: (vol: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.volume = Math.max(0, Math.min(1, vol));
        if (v.volume > 0) v.muted = false;
      },
      toggleMute: () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
      },
      setRate: (rate: number) => {
        const v = videoRef.current;
        if (v) v.playbackRate = Math.max(0.25, Math.min(2, rate));
      },
      requestPiP: async () => {
        const v = videoRef.current;
        if (!v) return;
        try {
          if (document.pictureInPictureElement) await document.exitPictureInPicture();
          else if ("requestPictureInPicture" in v)
            await (v as HTMLVideoElement).requestPictureInPicture();
        } catch (error) {
          console.warn("picture-in-picture could not be toggled", { error });
        }
      },
    };
  }, [videoRef, setCurrentTime]);

  return controls;
}

export type VideoController = ReturnType<typeof useVideoController>;
