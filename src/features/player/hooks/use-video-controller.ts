import * as React from "react";
import { usePlayerStore } from "../store";

/**
 * Wires an HTMLVideoElement to the player store. Returns helper controls.
 * Intentionally a thin layer — the source of truth for state is the video element itself.
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
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onTime = () => setCurrentTime(video.currentTime);
    const onDur = () =>
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onProg = () => {
      if (video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        setBuffered(video.duration > 0 ? end / video.duration : 0);
      }
    };
    const onVol = () => {
      setVolumeState(video.volume);
      setMuted(video.muted);
    };
    const onRate = () => setPlaybackRate(video.playbackRate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("progress", onProg);
    video.addEventListener("volumechange", onVol);
    video.addEventListener("ratechange", onRate);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("progress", onProg);
      video.removeEventListener("volumechange", onVol);
      video.removeEventListener("ratechange", onRate);
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

  const controls = React.useMemo(
    () => ({
      togglePlay: () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      },
      play: () => videoRef.current?.play().catch(() => {}),
      pause: () => videoRef.current?.pause(),
      seekTo: (t: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(v.duration || 0, t));
      },
      seekBy: (delta: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(
          0,
          Math.min(v.duration || 0, v.currentTime + delta),
        );
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
        if (v) v.playbackRate = rate;
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
    }),
    [videoRef],
  );

  return controls;
}

export type VideoController = ReturnType<typeof useVideoController>;
