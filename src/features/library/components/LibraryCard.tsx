import * as React from 'react'
import { Play, FolderOpen } from 'lucide-react'
import type { MediaFile } from '@/types/media'
import { formatBytes, formatRelative, formatTime } from '@/lib/format'
import { showInFolder, toMediaSrc } from '@/lib/tauri'
import { useThumbnail, useInView } from '@/hooks/use-thumbnail'
import { cn } from '@/lib/cn'

interface LibraryCardProps {
    item: MediaFile
    onPlay: () => void
}

export function LibraryCard({ item, onPlay }: LibraryCardProps) {
    const { ref, inView } = useInView<HTMLButtonElement>()
    const thumb = useThumbnail(item.path, inView)
    const [duration, setDuration] = React.useState<number | null>(null)

    React.useEffect(() => {
        if (!inView || duration !== null) return
        const v = document.createElement('video')
        v.preload = 'metadata'
        v.muted = true
        const release = () => {
            v.removeEventListener('loadedmetadata', onMeta)
            v.removeEventListener('error', release)
            v.removeAttribute('src')
            v.load()
        }
        const onMeta = () => {
            if (isFinite(v.duration)) setDuration(v.duration)
            release()
        }
        v.addEventListener('loadedmetadata', onMeta)
        v.addEventListener('error', release)
        v.src = toMediaSrc(item.path)
        return release
    }, [inView, item.path, duration])

    return (
        <button
            ref={ref}
            onClick={onPlay}
            className="group relative flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-pop"
        >
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-brand-700 to-brand-900 text-white/80">
                {thumb && (
                    <img
                        src={thumb}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                    />
                )}
                <Play
                    className={cn(
                        'relative h-8 w-8 drop-shadow-md transition-transform group-hover:scale-110',
                        thumb && 'opacity-0 group-hover:opacity-100',
                    )}
                />
                <span className="absolute right-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
                    {item.extension}
                </span>
                {duration !== null && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                        {formatTime(duration)}
                    </span>
                )}
            </div>
            <div className="flex w-full min-w-0 flex-col gap-0.5">
                <span className="line-clamp-2 text-sm font-medium leading-tight">{item.name}</span>
                <span className="text-[11px] text-muted-foreground">
                    {formatBytes(item.size)}
                    {item.modified ? ` · ${formatRelative(item.modified)}` : ''}
                </span>
            </div>
            <span
                role="button"
                tabIndex={-1}
                className="absolute right-2 top-2 rounded-md bg-card/80 p-1 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                    e.stopPropagation()
                    void showInFolder(item.path)
                }}
                aria-label="Show in folder"
            >
                <FolderOpen className="h-3.5 w-3.5" />
            </span>
        </button>
    )
}
