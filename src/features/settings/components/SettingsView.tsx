import { Root as SwitchRoot, Thumb as SwitchThumb } from '@radix-ui/react-switch'
import { useSettingsStore } from '../store'
import { cn } from '@/lib/cn'

interface RowProps {
    label: string
    description?: string
    children: React.ReactNode
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
    )
}

function ToggleRow({
    label,
    description,
    value,
    onChange,
}: {
    label: string
    description?: string
    value: boolean
    onChange: (b: boolean) => void
}) {
    return (
        <Row label={label} description={description}>
            <SwitchRoot
                checked={value}
                onCheckedChange={onChange}
                className={cn(
                    'relative h-5 w-9 cursor-pointer rounded-full transition-colors',
                    'data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
                )}
            >
                <SwitchThumb
                    className={cn(
                        'block h-4 w-4 translate-x-0.5 rounded-full bg-background shadow transition-transform',
                        'data-[state=checked]:translate-x-[18px]',
                    )}
                />
            </SwitchRoot>
        </Row>
    )
}

export function SettingsView() {
    const s = useSettingsStore()
    return (
        <div className="mx-auto w-full max-w-2xl px-6 py-8">
            <h1 className="mb-1 text-2xl font-semibold">Settings</h1>
            <p className="mb-6 text-sm text-muted-foreground">
                Tweak your playback experience.
            </p>

            <section className="rounded-lg border border-border bg-card px-4">
                <h2 className="-mx-4 border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Playback
                </h2>
                <ToggleRow
                    label="Resume from last position"
                    description="Continue videos where you left off."
                    value={s.rememberPosition}
                    onChange={(v) => s.set('rememberPosition', v)}
                />
                <ToggleRow
                    label="Autoplay next in queue"
                    value={s.autoplayNext}
                    onChange={(v) => s.set('autoplayNext', v)}
                />
                <Row label="Default volume">
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={s.defaultVolume}
                        onChange={(e) => s.setVolume(Number(e.target.value))}
                        className="w-40 accent-[var(--color-primary)]"
                    />
                </Row>
                <Row label="Seek step (s)">
                    <input
                        type="number"
                        min={1}
                        max={60}
                        value={s.seekStepSeconds}
                        onChange={(e) => s.set('seekStepSeconds', Number(e.target.value))}
                        className="h-9 w-20 rounded-md border border-border bg-input/40 px-3 text-sm"
                    />
                </Row>
                <Row label="Long seek step (s)">
                    <input
                        type="number"
                        min={1}
                        max={120}
                        value={s.longSeekStepSeconds}
                        onChange={(e) => s.set('longSeekStepSeconds', Number(e.target.value))}
                        className="h-9 w-20 rounded-md border border-border bg-input/40 px-3 text-sm"
                    />
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
                    onChange={(v) => s.set('scanRecursive', v)}
                />
            </section>
        </div>
    )
}
