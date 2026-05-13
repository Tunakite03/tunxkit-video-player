import * as React from 'react'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/format'
import { usePlayerStore } from '../store'
import type { VideoController } from '../hooks/use-video-controller'

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
    const seekFrameRef = React.useRef<number | null>(null)

    const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0
    const displayedPercent = previewPercent ?? currentPercent
    const displayedTime = duration > 0 ? (displayedPercent / 100) * duration : currentTime

    const seekToPercent = React.useCallback(
        (percent: number) => {
            if (duration > 0) controller.seekTo((percent / 100) * duration)
        },
        [controller, duration],
    )

    const previewSeek = React.useCallback(
        (percent: number) => {
            setPreviewPercent(percent)
            pendingSeekRef.current = percent

            if (seekFrameRef.current !== null) return

            seekFrameRef.current = window.requestAnimationFrame(() => {
                seekFrameRef.current = null
                const nextPercent = pendingSeekRef.current
                if (nextPercent === null) return

                const now = performance.now()
                if (now - lastSeekAtRef.current < 90) return

                lastSeekAtRef.current = now
                seekToPercent(nextPercent)
            })
        },
        [seekToPercent],
    )

    const commitSeek = React.useCallback(
        (percent: number) => {
            pendingSeekRef.current = null
            if (seekFrameRef.current !== null) {
                window.cancelAnimationFrame(seekFrameRef.current)
                seekFrameRef.current = null
            }
            lastSeekAtRef.current = performance.now()
            seekToPercent(percent)
            setPreviewPercent(null)
        },
        [seekToPercent],
    )

    return (
        <div className={cn('flex items-center gap-3 text-xs tabular-nums text-white/85', className)}>
            <span className="w-14 text-right">{formatTime(displayedTime)}</span>
            <Slider
                value={[displayedPercent]}
                max={100}
                step={0.01}
                buffered={buffered}
                onValueChange={([v]) => previewSeek(v)}
                onValueCommit={([v]) => commitSeek(v)}
                className="flex-1"
                size="md"
                aria-label="Seek"
            />
            <span className="w-14">{formatTime(duration)}</span>
        </div>
    )
}
