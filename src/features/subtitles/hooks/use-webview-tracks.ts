import * as React from "react";
import { languageName } from "../tracks";
import { useSubtitleStore, type InbandTrack } from "../store";

const trackIds = new WeakMap<TextTrack, string>();
let lastTrackId = 0;

function idOf(textTrack: TextTrack): string {
  let id = trackIds.get(textTrack);
  if (!id) {
    id = `inband:${++lastTrackId}`;
    trackIds.set(textTrack, id);
  }
  return id;
}

const isSubtitleTrack = (t: TextTrack) => t.kind === "subtitles" || t.kind === "captions";

/** The subtitle tracks among the element's text tracks. */
function subtitleTracksOf(list: TextTrackList): TextTrack[] {
  const tracks: TextTrack[] = [];
  for (let i = 0; i < list.length; i++) if (isSubtitleTrack(list[i])) tracks.push(list[i]);
  return tracks;
}

export function toInbandTrack(textTrack: TextTrack, position: number): InbandTrack {
  return {
    id: idOf(textTrack),
    source: "inband",
    textTrack,
    label:
      textTrack.label ||
      (textTrack.language ? languageName(textTrack.language) : `Track ${position}`),
    hint: textTrack.kind === "captions" ? "CC" : "Embedded",
  };
}

/**
 * Offer the subtitle tracks the webview found inside the video (WKWebView does for
 * MP4/MOV; WebView2 never does) and keep their modes in step with the selection: the
 * selected one "hidden", so its cues load for the overlay without the webview drawing
 * them too, every other one "disabled".
 */
export function useWebviewTracks(videoRef: React.RefObject<HTMLVideoElement | null>) {
  React.useEffect(() => {
    // Typed as always present, but test DOMs and some webviews leave it out.
    const list = videoRef.current?.textTracks as TextTrackList | undefined;
    if (!list) return;

    const enforceModes = () => {
      const { activeTrackId } = useSubtitleStore.getState();
      for (const textTrack of subtitleTracksOf(list)) {
        const mode = idOf(textTrack) === activeTrackId ? "hidden" : "disabled";
        // Only on a difference: setting a mode fires `change`, which calls this again.
        if (textTrack.mode !== mode) textTrack.mode = mode;
      }
    };
    const register = () => {
      const { videoPath, addTracks } = useSubtitleStore.getState();
      if (videoPath)
        addTracks(
          videoPath,
          subtitleTracksOf(list).map((t, i) => toInbandTrack(t, i + 1)),
        );
      enforceModes();
    };
    const onRemove = (event: TrackEvent) => {
      const id = event.track && trackIds.get(event.track as TextTrack);
      if (id) useSubtitleStore.getState().removeTrack(id);
    };

    list.addEventListener("addtrack", register);
    list.addEventListener("removetrack", onRemove);
    list.addEventListener("change", enforceModes);
    const unsubscribe = useSubtitleStore.subscribe((state, prev) => {
      // A new video's store starts empty; offer whatever this element already has.
      if (state.videoPath !== prev.videoPath) register();
      else if (state.activeTrackId !== prev.activeTrackId || state.tracks !== prev.tracks)
        enforceModes();
    });
    register();
    return () => {
      unsubscribe();
      list.removeEventListener("addtrack", register);
      list.removeEventListener("removetrack", onRemove);
      list.removeEventListener("change", enforceModes);
    };
  }, [videoRef]);
}
