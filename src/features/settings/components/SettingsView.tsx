import * as React from "react";
import { Root as SwitchRoot, Thumb as SwitchThumb } from "@radix-ui/react-switch";
import { usePlayerStore } from "@/features/player/store";
import { isSubtitleEncoding, SUBTITLE_ENCODINGS } from "@/features/subtitles/parse";
import { useSettingsStore } from "../store";
import { cn } from "@/lib/cn";

interface RowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function Row({ label, description, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border py-4 last:border-b-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <Row label={label} description={description}>
      <SwitchRoot
        checked={value}
        onCheckedChange={onChange}
        className={cn(
          "relative h-5 w-9 cursor-pointer rounded-full transition-colors",
          "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted",
        )}
      >
        <SwitchThumb
          className={cn(
            "block h-4 w-4 translate-x-0.5 rounded-full bg-background shadow transition-transform",
            "data-[state=checked]:translate-x-[18px]",
          )}
        />
      </SwitchRoot>
    </Row>
  );
}

/**
 * Number field that keeps a local draft while typing and only commits a valid,
 * clamped value on blur / Enter — committing every keystroke would clamp partial
 * input (e.g. typing "15" into a 5..300 field would turn the "1" into "5").
 */
function NumberRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
    setDraft(null);
  };

  return (
    <Row label={label} description={`${min}–${max}`}>
      <input
        type="number"
        min={min}
        max={max}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
        }}
        className="h-9 w-20 rounded-md border border-border bg-input/40 px-3 text-sm"
      />
    </Row>
  );
}

export function SettingsView() {
  const s = useSettingsStore();
  const setPlayerVolume = usePlayerStore((p) => p.setVolume);
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Tweak your playback experience.</p>

      <section className="rounded-lg border border-border bg-card px-4">
        <h2 className="-mx-4 border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Playback
        </h2>
        <ToggleRow
          label="Resume from last position"
          description="Continue videos where you left off."
          value={s.rememberPosition}
          onChange={(v) => s.set("rememberPosition", v)}
        />
        <ToggleRow
          label="Autoplay next in queue"
          value={s.autoplayNext}
          onChange={(v) => s.set("autoplayNext", v)}
        />
        <Row label="Default volume" description="Volume used when the app starts.">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.defaultVolume}
            onChange={(e) => {
              const v = Number(e.target.value);
              s.setVolume(v);
              // Apply it to the player too, otherwise the setting has no visible effect.
              setPlayerVolume(v);
            }}
            className="w-40 accent-[var(--color-primary)]"
          />
        </Row>
        <NumberRow
          label="Seek step (s)"
          min={1}
          max={60}
          value={s.seekStepSeconds}
          onChange={(n) => s.set("seekStepSeconds", n)}
        />
        <NumberRow
          label="Long seek step (s)"
          min={5}
          max={300}
          value={s.longSeekStepSeconds}
          onChange={(n) => s.set("longSeekStepSeconds", n)}
        />
        <Row label="Default playback speed">
          <select
            value={s.defaultPlaybackRate}
            onChange={(e) => s.set("defaultPlaybackRate", Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-input/40 px-2 text-sm"
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </Row>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card px-4">
        <h2 className="-mx-4 border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Subtitles
        </h2>
        <Row
          label="Encoding of older subtitle files"
          description="Used for .srt and .vtt files that aren't Unicode. Applies to subtitles loaded after the change."
        >
          <select
            aria-label="Encoding of older subtitle files"
            value={s.subtitleEncoding}
            onChange={(e) => {
              const encoding = e.target.value;
              if (isSubtitleEncoding(encoding)) s.set("subtitleEncoding", encoding);
            }}
            className="h-9 max-w-56 rounded-md border border-border bg-input/40 px-2 text-sm"
          >
            {SUBTITLE_ENCODINGS.map((encoding) => (
              <option key={encoding.id} value={encoding.id}>
                {encoding.label}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card px-4">
        <h2 className="-mx-4 border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Library
        </h2>
        <ToggleRow
          label="Scan folders recursively"
          description="Include videos in subfolders when scanning."
          value={s.scanRecursive}
          onChange={(v) => s.set("scanRecursive", v)}
        />
      </section>
    </div>
  );
}
