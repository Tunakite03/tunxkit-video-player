import type * as React from "react";
import { cn } from "@/lib/cn";
import { useActiveCues } from "../hooks/use-active-cues";
import { useSubtitleStore, selectActiveTrack } from "../store";
import type { CueSegment } from "../parse";

interface SubtitleOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Move the lines up, clear of the player controls. */
  raised: boolean;
}

/** Lines of the selected subtitle track, drawn over the video. */
export function SubtitleOverlay({ videoRef, raised }: SubtitleOverlayProps) {
  const track = useSubtitleStore(selectActiveTrack);
  const active = useActiveCues(videoRef, track);
  if (active.length === 0) return null;

  return (
    <div
      data-testid="subtitle-overlay"
      className={cn(
        // A size container, so the text scales with the player's width (cqw).
        "@container pointer-events-none absolute inset-x-0 z-20 flex justify-center px-[6%]",
        "transition-[bottom] duration-200",
        raised ? "bottom-32" : "bottom-[6%]",
      )}
    >
      <div className="flex flex-col items-center gap-[0.15em] text-center text-[length:clamp(1rem,3.2cqw,2.75rem)] leading-snug font-medium text-white">
        {active.map((cue, c) =>
          cue.lines.map((line, l) => (
            <p key={`${c}-${l}`} className="whitespace-pre-wrap">
              <span className="rounded-[0.2em] bg-black/65 px-[0.4em] py-[0.05em] [box-decoration-break:clone] [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">
                {line.map((segment, s) => (
                  <Segment key={s} segment={segment} />
                ))}
              </span>
            </p>
          )),
        )}
      </div>
    </div>
  );
}

function Segment({ segment }: { segment: CueSegment }) {
  if (!segment.italic && !segment.bold && !segment.underline) return segment.text;
  return (
    <span
      className={cn(
        segment.italic && "italic",
        segment.bold && "font-bold",
        segment.underline && "underline",
      )}
    >
      {segment.text}
    </span>
  );
}
