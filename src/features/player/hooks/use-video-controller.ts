import * as React from "react";
import { usePlayerStore } from "../store";

/** Fraction (0..1) of the media buffered around the current playback position. */
function bufferedFraction(video: HTMLVideoElement): number {
  const { buffered, duration, currentTime } = video;
  if (!(duration > 0) || !Number.isFinite(duration) || buffered.length === 0)
    return 0;
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
 */
export function useVideoController(
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const setPaused = usePlayerStore((s) => s.setPaused);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setBuffered = usePlayerStore((s) => s.setBuffered);
  const setVolumeState = usePlayerStore((s) => s.setVolume);
  const setMuted = usePlayerStore((s) => s.setMuted);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // `timeupdate` only fires ~4 times per second, so drive the progress bar
    // from animation frames while playing to keep it in step with the picture.
    let frame: number | null = null;
    const stopTicking = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
    const tick = () => {
      setCurrentTime(video.currentTime);
      frame = window.requestAnimationFrame(tick);
    };
    const startTicking = () => {
      if (frame === null) frame = window.requestAnimationFrame(tick);
    };

    const onPlaying = () => {
      setPaused(false);
      startTicking();
    };
    const onPlay = () => setPaused(false);
    const onPause = () => {
      setPaused(true);
      stopTicking();
      setCurrentTime(video.currentTime);
    };
    const onWaiting = () => stopTicking();
    const onTime = () => {
      setCurrentTime(video.currentTime);
      setBuffered(bufferedFraction(video));
    };
    const onDur = () =>
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onProg = () => setBuffered(bufferedFraction(video));
    const onEmptied = () => {
      stopTicking();
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

    const events: [keyof HTMLMediaElementEventMap, () => void][] = [
      ["play", onPlay],
      ["playing", onPlaying],
      ["pause", onPause],
      ["ended", onPause],
      ["waiting", onWaiting],
      ["timeupdate", onTime],
      ["seeking", onTime],
      ["seeked", onTime],
      ["loadedmetadata", onDur],
      ["durationchange", onDur],
      ["progress", onProg],
      ["emptied", onEmptied],
      ["volumechange", onVol],
      ["ratechange", onRate],
    ];
    for (const [name, fn] of events) video.addEventListener(name, fn);

    // Sync with whatever state the element is already in.
    onDur();
    onTime();
    onVol();
    if (video.paused) setPaused(true);
    else onPlaying();

    return () => {
      stopTicking();
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
        if (v.paused || v.ended) v.play().catch(() => {});
        else v.pause();
      },
      play: () => videoRef.current?.play().catch(() => {}),
      pause: () => videoRef.current?.pause(),
      seekTo,
      seekBy: (delta: number) => {
        const v = videoRef.current;
        if (!v) return;
        seekTo(v.currentTime + delta);
      },
      restart: () => {
        const v = videoRef.current;
        if (!v || !v.currentSrc) return;
        seekTo(0);
        v.play().catch(() => {});
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
          if (document.pictureInPictureElement)
            await document.exitPictureInPicture();
          else if ("requestPictureInPicture" in v)
            await (v as HTMLVideoElement).requestPictureInPicture();
        } catch {
          /* unsupported */
        }
      },
    };
  }, [videoRef, setCurrentTime]);

  return controls;
}

export type VideoController = ReturnType<typeof useVideoController>;
