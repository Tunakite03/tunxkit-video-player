import * as React from 'react'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/format'
import { usePlayerStore } from '../store'
import type { VideoController } from '../hooks/use-video-controller'

/** Minimum gap between live seeks while dragging, so the decoder isn't flooded. */
const DRAG_SEEK_INTERVAL_MS = 90

interface SeekBarProps {
    controller: VideoController
    className?: string
}

export function SeekBar({ controller, className }: SeekBarProps) {
    const duration = usePlayerStore((s) => s.duration)
    const currentTime = usePlayerStore((s) => s.currentTime)
    const buffered = usePlayerStore((s) => s.buffered)
    const [previewPercent, setPreviewPercent] = React.useState<number | null>(null)

    const lastSeekAtRef = React.useRef(0)
    const pendingSeekRef = React.useRef<number | null>(null)
    const seekTimerRef = React.useRef<number | null>(null)

    const currentPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
    const displayedPercent = previewPercent ?? currentPercent
    const displayedTime = duration > 0 ? (displayedPercent / 100) * duration : currentTime

    const seekToPercent = React.useCallback(
        (percent: number) => {
            if (duration > 0) controller.seekTo((percent / 100) * duration)
        },
        [controller, duration],
    )

    const cancelPendingSeek = React.useCallback(() => {
        pendingSeekRef.current = null
        if (seekTimerRef.current !== null) {
            window.clearTimeout(seekTimerRef.current)
            seekTimerRef.current = null
        }
    }, [])

    React.useEffect(() => cancelPendingSeek, [cancelPendingSeek])

    const previewSeek = React.useCallback(
        (percent: number) => {
            setPreviewPercent(percent)
            pendingSeekRef.current = percent
            if (seekTimerRef.current !== null) return

            const wait = Math.max(0, DRAG_SEEK_INTERVAL_MS - (performance.now() - lastSeekAtRef.current))
            seekTimerRef.current = window.setTimeout(() => {
                seekTimerRef.current = null
                const nextPercent = pendingSeekRef.current
                if (nextPercent === null) return
                pendingSeekRef.current = null
                lastSeekAtRef.current = performance.now()
                seekToPercent(nextPercent)
            }, wait)
        },
        [seekToPercent],
    )

    const commitSeek = React.useCallback(
        (percent: number) => {
            cancelPendingSeek()
            lastSeekAtRef.current = performance.now()
            seekToPercent(percent)
            setPreviewPercent(null)
        },
        [cancelPendingSeek, seekToPercent],
    )

    return (
        <div className={cn('flex items-center gap-3 text-xs tabular-nums text-white/85', className)}>
            <span className="w-14 text-right">{formatTime(displayedTime)}</span>
            <Slider
                value={[displayedPercent]}
                max={100}
                step={0.01}
                buffered={buffered}
                disabled={duration <= 0}
                onValueChange={([v]) => previewSeek(v)}
                onValueCommit={([v]) => commitSeek(v)}
                // Don't keep keyboard focus on the thumb after a mouse seek, otherwise
                // the arrow keys nudge the slider instead of using the player shortcuts.
                onPointerUp={(e) => {
                    const active = document.activeElement
                    if (active instanceof HTMLElement && e.currentTarget.contains(active)) active.blur()
                }}
                className="flex-1"
                size="md"
                aria-label="Seek"
            />
            <span className="w-14">{formatTime(duration)}</span>
        </div>
    )
}
