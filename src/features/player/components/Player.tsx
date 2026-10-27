import * as React from "react";
import { FileVideo2, TriangleAlert } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/cn";
import { getMediaInfo, toMediaSrc } from "@/lib/tauri";
import { useSettingsStore } from "@/features/settings/store";
import { usePlayerStore, useResumeStore } from "../store";
import { usePlaylistStore, selectCurrentTrack } from "@/features/playlist/store";
import { useVideoController } from "../hooks/use-video-controller";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useIdle } from "@/hooks/use-idle";
import { PlayerControls } from "./PlayerControls";

/** Positions this close to the end count as "finished" and are not resumed. */
const END_THRESHOLD_SECONDS = 5;

interface PlayerProps {
  /**
   * What goes fullscreen. Only its subtree is painted in fullscreen, so it must hold
   * everything that should stay usable there, such as the playlist beside the player.
   */
  fullscreenTargetRef: React.RefObject<HTMLElement | null>;
  className?: string;
}

export function Player({ fullscreenTargetRef, className }: PlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const track = usePlaylistStore(selectCurrentTrack);
  const next = usePlaylistStore((s) => s.next);
  const prev = usePlaylistStore((s) => s.prev);
  const pushRecent = usePlaylistStore((s) => s.pushRecent);
  const togglePlaylist = useUIStore((s) => s.togglePlaylist);

  const setFullscreen = usePlayerStore((s) => s.setFullscreen);
  const rememberPosition = useResumeStore((s) => s.rememberPosition);
  const forgetPosition = useResumeStore((s) => s.forgetPosition);
  const resetMediaState = usePlayerStore((s) => s.resetMediaState);
  const paused = usePlayerStore((s) => s.paused);

  const rememberPositionEnabled = useSettingsStore((s) => s.rememberPosition);

  /** Tagged with the path it belongs to, so it clears itself when the track changes. */
  const [playbackError, setPlaybackError] = React.useState<{
    path: string;
    message: string;
  } | null>(null);

  const idle = useIdle(wrapperRef, 2500);
  const controlsVisible = paused || !idle;
  const controller = useVideoController(videoRef, controlsVisible);
  const trackFile = track?.file;
  const trackPath = trackFile?.path;
  const errorMessage =
    playbackError && playbackError.path === trackPath ? playbackError.message : null;

  /* ---------- Sync track ---------- */
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    resetMediaState();
    if (!trackFile || !trackPath) {
      video.removeAttribute("src");
      video.load();
      return;
    }
    const { volume, muted } = usePlayerStore.getState();
    const { defaultPlaybackRate, rememberPosition: resume } = useSettingsStore.getState();
    video.src = toMediaSrc(trackPath);
    video.volume = volume;
    video.muted = muted;
    video.defaultPlaybackRate = defaultPlaybackRate;
    video.playbackRate = defaultPlaybackRate;
    const onLoaded = () => {
      const resumeAt = resume ? useResumeStore.getState().positions[trackPath] : undefined;
      const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
      if (resumeAt && Number.isFinite(resumeAt) && resumeAt < duration - END_THRESHOLD_SECONDS) {
        video.currentTime = resumeAt;
      }
      video.play().catch(() => {});
    };
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    pushRecent(trackFile);
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [pushRecent, resetMediaState, trackFile, trackPath]);

  /* ---------- Persist position ---------- */
  React.useEffect(() => {
    if (!rememberPositionEnabled || !trackPath) return;
    const video = videoRef.current;
    if (!video) return;
    const persistPosition = () => {
      // Ignore events fired while the next source is loading.
      if (!video.currentSrc || video.readyState === HTMLMediaElement.HAVE_NOTHING) return;
      const { currentTime, duration } = video;
      if (
        video.ended ||
        (Number.isFinite(duration) && duration - currentTime < END_THRESHOLD_SECONDS)
      ) {
        forgetPosition(trackPath);
      } else {
        rememberPosition(trackPath, currentTime);
      }
    };
    const id = window.setInterval(() => {
      if (!video.paused) persistPosition();
    }, 5000);
    video.addEventListener("pause", persistPosition);
    video.addEventListener("seeked", persistPosition);
    return () => {
      window.clearInterval(id);
      video.removeEventListener("pause", persistPosition);
      video.removeEventListener("seeked", persistPosition);
      persistPosition();
    };
  }, [trackPath, rememberPositionEnabled, rememberPosition, forgetPosition]);

  /* ---------- Repeat / autoplay next on end ---------- */
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnded = () => {
      const { repeat, currentIndex } = usePlaylistStore.getState();
      if (repeat === "one") {
        controller.restart();
        return;
      }
      if (!useSettingsStore.getState().autoplayNext) return;
      const upcoming = next();
      // A one-item queue on "repeat all" wraps onto itself: the track
      // doesn't change, so the source isn't reloaded — replay it here.
      if (upcoming && usePlaylistStore.getState().currentIndex === currentIndex) {
        controller.restart();
      }
    };
    v.addEventListener("ended", onEnded);
    return () => v.removeEventListener("ended", onEnded);
  }, [controller, next]);

  /* ---------- Playback errors ---------- */
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onError = () => {
      const file = selectCurrentTrack(usePlaylistStore.getState())?.file;
      if (!file || !v.getAttribute("src")) return;
      const code = v.error?.code;
      // The asset protocol answers a missing file the same way as an unsupported
      // one, so ask the backend whether the file is still there.
      getMediaInfo(file.path)
        .then(
          () =>
            code === MediaError.MEDIA_ERR_DECODE
              ? "The video could not be decoded."
              : "This format or codec is not supported.",
          () => "The file was moved, deleted, or cannot be read.",
        )
        .then((message) => {
          if (selectCurrentTrack(usePlaylistStore.getState())?.file.path === file.path) {
            setPlaybackError({ path: file.path, message });
          }
        });
    };
    v.addEventListener("error", onError);
    return () => v.removeEventListener("error", onError);
  }, []);

  /* ---------- Previous: restart the current video first ---------- */
  const goPrevious = React.useCallback(() => {
    const v = videoRef.current;
    if (v && v.currentTime > 3) {
      controller.seekTo(0);
      return;
    }
    const before = usePlaylistStore.getState().currentIndex;
    prev();
    if (usePlaylistStore.getState().currentIndex === before) controller.seekTo(0);
  }, [controller, prev]);

  /* ---------- Fullscreen ---------- */
  const toggleFullscreen = React.useCallback(() => {
    const el = fullscreenTargetRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, [fullscreenTargetRef]);

  React.useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    onFs();
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [setFullscreen]);

  /* ---------- Keyboard ---------- */
  useKeyboardShortcuts((e) => {
    if (!track) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const seekStep = useSettingsStore.getState().seekStepSeconds;
    const longSeek = useSettingsStore.getState().longSeekStepSeconds;
    if (e.shiftKey && (e.key === "N" || e.key === "n")) {
      e.preventDefault();
      next();
      return;
    }
    if (e.shiftKey && (e.key === "P" || e.key === "p")) {
      e.preventDefault();
      goPrevious();
      return;
    }
    switch (e.key) {
      case " ":
      case "k":
      case "K":
        e.preventDefault();
        controller.togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        controller.seekBy(-seekStep);
        break;
      case "ArrowRight":
        e.preventDefault();
        controller.seekBy(seekStep);
        break;
      case "j":
      case "J":
        controller.seekBy(-longSeek);
        break;
      case "l":
      case "L":
        controller.seekBy(longSeek);
        break;
      case ",":
        controller.stepFrame(-1);
        break;
      case ".":
        controller.stepFrame(1);
        break;
      case "Home":
        e.preventDefault();
        controller.seekTo(0);
        break;
      case "End": {
        e.preventDefault();
        const v = videoRef.current;
        if (v) controller.seekTo(v.duration || 0);
        break;
      }
      case "ArrowUp":
        e.preventDefault();
        controller.setVolume(usePlayerStore.getState().volume + 0.05);
        break;
      case "ArrowDown":
        e.preventDefault();
        controller.setVolume(usePlayerStore.getState().volume - 0.05);
        break;
      case "m":
      case "M":
        controller.toggleMute();
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "q":
      case "Q":
        togglePlaylist();
        break;
      case "p":
        controller.requestPiP();
        break;
      case ">":
        controller.setRate(usePlayerStore.getState().playbackRate + 0.25);
        break;
      case "<":
        controller.setRate(usePlayerStore.getState().playbackRate - 0.25);
        break;
      default: {
        if (/^[0-9]$/.test(e.key)) {
          const v = videoRef.current;
          if (v && v.duration) controller.seekTo((parseInt(e.key, 10) / 10) * v.duration);
        }
      }
    }
  });

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "group relative flex h-full w-full items-center justify-center overflow-hidden bg-black",
        track && !controlsVisible && "cursor-none",
        className,
      )}
      onDoubleClick={track ? toggleFullscreen : undefined}
      tabIndex={-1}
    >
      {/* Always mounted so the controller's listeners stay attached across track changes. */}
      <video
        ref={videoRef}
        className={cn("h-full w-full object-contain", !track && "hidden")}
        playsInline
        preload="metadata"
        onClick={() => controller.togglePlay()}
      />
      {!track && <EmptyState />}
      {track && errorMessage && <ErrorState name={track.file.name} message={errorMessage} />}

      {track && (
        <PlayerControls
          controller={controller}
          onToggleFullscreen={toggleFullscreen}
          onPrevious={goPrevious}
          visible={controlsVisible}
        />
      )}
    </div>
  );
}

function ErrorState({ name, message }: { name: string; message: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white/70">
      <TriangleAlert className="h-12 w-12 text-amber-400" />
      <p className="max-w-md truncate text-sm font-medium text-white/90" title={name}>
        Can't play {name}
      </p>
      <p className="text-xs text-white/50">{message}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 text-white/60">
      <FileVideo2 className="h-12 w-12" />
      <p className="text-sm">Open a video to start playing</p>
      <p className="text-xs text-white/40">Drag &amp; drop a file here, or use Ctrl+O</p>
    </div>
  );
}
