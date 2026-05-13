import * as React from 'react'
import { FileVideo2 } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/cn'
import { toMediaSrc } from '@/lib/tauri'
import { useSettingsStore } from '@/features/settings/store'
import { usePlayerStore } from '../store'
import { usePlaylistStore, selectCurrentTrack } from '@/features/playlist/store'
import { useVideoController } from '../hooks/use-video-controller'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useIdle } from '@/hooks/use-idle'
import { PlayerControls } from './PlayerControls'

interface PlayerProps {
    className?: string
}

export function Player({ className }: PlayerProps) {
    const videoRef = React.useRef<HTMLVideoElement>(null)
    const wrapperRef = React.useRef<HTMLDivElement>(null)
    const controller = useVideoController(videoRef)
    const track = usePlaylistStore(selectCurrentTrack)
    const next = usePlaylistStore((s) => s.next)
    const pushRecent = usePlaylistStore((s) => s.pushRecent)
    const togglePlaylist = useUIStore((s) => s.togglePlaylist)

    const setFullscreen = usePlayerStore((s) => s.setFullscreen)
    const rememberPosition = usePlayerStore((s) => s.rememberPosition)
    const resetMediaState = usePlayerStore((s) => s.resetMediaState)
    const paused = usePlayerStore((s) => s.paused)

    const rememberPositionEnabled = useSettingsStore((s) => s.rememberPosition)
    const autoplayNext = useSettingsStore((s) => s.autoplayNext)
    const defaultVolume = useSettingsStore((s) => s.defaultVolume)
    const defaultRate = useSettingsStore((s) => s.defaultPlaybackRate)

    const idle = useIdle(wrapperRef, 2500)
    const controlsVisible = paused || !idle
    const trackFile = track?.file
    const trackPath = trackFile?.path

    /* ---------- Sync track ---------- */
    React.useEffect(() => {
        const video = videoRef.current
        if (!video) return
        if (!trackFile || !trackPath) {
            video.removeAttribute('src')
            video.load()
            resetMediaState()
            return
        }
        video.src = toMediaSrc(trackPath)
        video.volume = defaultVolume
        video.playbackRate = defaultRate
        const onLoaded = () => {
            const resumeAt = rememberPositionEnabled ? usePlayerStore.getState().positions[trackPath] : undefined
            if (resumeAt && Number.isFinite(resumeAt) && resumeAt < (video.duration || Infinity)) {
                video.currentTime = resumeAt
            }
            video.play().catch(() => { })
        }
        video.addEventListener('loadedmetadata', onLoaded, { once: true })
        pushRecent(trackFile)
        return () => {
            video.removeEventListener('loadedmetadata', onLoaded)
        }
    }, [defaultRate, defaultVolume, pushRecent, rememberPositionEnabled, resetMediaState, trackFile, trackPath])

    /* ---------- Persist position ---------- */
    React.useEffect(() => {
        if (!rememberPositionEnabled || !trackPath) return
        const video = videoRef.current
        if (!video) return
        const persistPosition = () => rememberPosition(trackPath, video.currentTime)
        const id = window.setInterval(() => {
            if (!video.paused) persistPosition()
        }, 5000)
        video.addEventListener('pause', persistPosition)
        video.addEventListener('seeked', persistPosition)
        return () => {
            window.clearInterval(id)
            video.removeEventListener('pause', persistPosition)
            video.removeEventListener('seeked', persistPosition)
            persistPosition()
        }
    }, [trackPath, rememberPositionEnabled, rememberPosition])

    /* ---------- Autoplay next on end ---------- */
    React.useEffect(() => {
        const v = videoRef.current
        if (!v) return
        const onEnded = () => {
            if (autoplayNext) next()
        }
        v.addEventListener('ended', onEnded)
        return () => v.removeEventListener('ended', onEnded)
    }, [autoplayNext, next])

    /* ---------- Fullscreen ---------- */
    const toggleFullscreen = React.useCallback(() => {
        const el = wrapperRef.current
        if (!el) return
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { })
        } else {
            el.requestFullscreen().catch(() => { })
        }
    }, [])

    React.useEffect(() => {
        const onFs = () => setFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', onFs)
        return () => document.removeEventListener('fullscreenchange', onFs)
    }, [setFullscreen])

    /* ---------- Keyboard ---------- */
    useKeyboardShortcuts((e) => {
        if (!track) return
        const seekStep = useSettingsStore.getState().seekStepSeconds
        const longSeek = useSettingsStore.getState().longSeekStepSeconds
        switch (e.key) {
            case ' ':
            case 'k':
            case 'K':
                e.preventDefault(); controller.togglePlay(); break
            case 'ArrowLeft':
                controller.seekBy(-seekStep); break
            case 'ArrowRight':
                controller.seekBy(seekStep); break
            case 'j':
            case 'J':
                controller.seekBy(-longSeek); break
            case 'l':
            case 'L':
                controller.seekBy(longSeek); break
            case ',':
                controller.seekBy(-1 / 30); controller.pause(); break
            case '.':
                controller.seekBy(1 / 30); controller.pause(); break
            case 'Home':
                controller.seekTo(0); break
            case 'End': {
                const v = videoRef.current; if (v) controller.seekTo(v.duration || 0); break
            }
            case 'ArrowUp':
                controller.setVolume(usePlayerStore.getState().volume + 0.05); break
            case 'ArrowDown':
                controller.setVolume(usePlayerStore.getState().volume - 0.05); break
            case 'm':
            case 'M':
                controller.toggleMute(); break
            case 'f':
            case 'F':
                toggleFullscreen(); break
            case 'q':
            case 'Q':
                togglePlaylist(); break
            case 'p':
            case 'P':
                controller.requestPiP(); break
            case '>':
                controller.setRate(Math.min(2, usePlayerStore.getState().playbackRate + 0.25)); break
            case '<':
                controller.setRate(Math.max(0.25, usePlayerStore.getState().playbackRate - 0.25)); break
            default: {
                if (/^[0-9]$/.test(e.key)) {
                    const v = videoRef.current
                    if (v && v.duration) controller.seekTo((parseInt(e.key, 10) / 10) * v.duration)
                }
            }
        }
    })

    return (
        <div
            ref={wrapperRef}
            className={cn(
                'group relative flex h-full w-full items-center justify-center overflow-hidden bg-black',
                className,
            )}
            onDoubleClick={toggleFullscreen}
            tabIndex={-1}
        >
            {track ? (
                <video
                    ref={videoRef}
                    className="h-full w-full object-contain"
                    playsInline
                    preload="metadata"
                    onClick={() => controller.togglePlay()}
                />
            ) : (
                <EmptyState />
            )}

            {track && (
                <PlayerControls
                    controller={controller}
                    onToggleFullscreen={toggleFullscreen}
                    visible={controlsVisible}
                />
            )}
        </div>
    )
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-3 text-white/60">
            <FileVideo2 className="h-12 w-12" />
            <p className="text-sm">Open a video to start playing</p>
            <p className="text-xs text-white/40">Drag &amp; drop a file here, or use Ctrl+O</p>
        </div>
    )
}
