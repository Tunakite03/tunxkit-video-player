import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { useSubtitleStore, type CueListTrack, type InbandTrack } from "./store";

const cueTrack = (id: string, source: CueListTrack["source"]): CueListTrack => ({
  id,
  source,
  label: id,
  hint: "SRT",
  cues: [{ start: 0, end: 1, lines: [] }],
});

const webviewTrack = (id: string): InbandTrack => ({
  id,
  source: "inband",
  label: id,
  hint: "Embedded",
  textTrack: new EventTarget() as TextTrack,
});

const store = () => useSubtitleStore.getState();

beforeEach(() => {
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  useSubtitleStore.setState(useSubtitleStore.getInitialState(), true);
  store().resetFor("/v/a.mp4");
});

describe("subtitle store", () => {
  it("shows the best source on its own: a file, then the container, then the webview", () => {
    store().addTracks("/v/a.mp4", [webviewTrack("inband:1")]);
    expect(store().activeTrackId).toBe("inband:1");
    store().addTracks("/v/a.mp4", [cueTrack("embedded:2", "embedded")]);
    expect(store().activeTrackId).toBe("embedded:2");
    store().addTracks("/v/a.mp4", [cueTrack("/v/a.srt", "file")]);
    expect(store().activeTrackId).toBe("/v/a.srt");
  });

  it("drops the webview's tracks once the backend has read the container", () => {
    store().addTracks("/v/a.mp4", [webviewTrack("inband:1")]);
    store().addTracks("/v/a.mp4", [cueTrack("embedded:2", "embedded")]);
    store().addTracks("/v/a.mp4", [webviewTrack("inband:3")]);
    expect(store().tracks.map((t) => t.id)).toEqual(["embedded:2"]);
  });

  it("keeps the user's choice when more tracks arrive", () => {
    store().addTracks("/v/a.mp4", [cueTrack("embedded:2", "embedded")]);
    store().select(null);
    store().addTracks("/v/a.mp4", [cueTrack("/v/a.srt", "file")]);
    expect(store().activeTrackId).toBeNull();
    expect(useSettingsStore.getState().subtitlesEnabled).toBe(false);
  });

  it("ignores tracks that arrive for a video that is no longer current", () => {
    store().resetFor("/v/b.mp4");
    store().addTracks("/v/a.mp4", [cueTrack("/v/a.srt", "file")]);
    expect(store().tracks).toEqual([]);
  });
});
