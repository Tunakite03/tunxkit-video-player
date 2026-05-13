import * as React from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { Providers } from './providers'
import { AppRouter } from './router'
import { useUIStore } from '@/stores/ui-store'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { getMediaInfo, pickVideoFiles, pickFolder, scanDirectory } from '@/lib/tauri'
import { usePlaylistStore } from '@/features/playlist/store'
import { toast } from 'sonner'

function GlobalShortcuts() {
    const openShortcuts = useUIStore((s) => s.openShortcuts)
    const setQueue = usePlaylistStore((s) => s.setQueue)

    useKeyboardShortcuts(async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
            e.preventDefault()
            if (e.shiftKey) {
                const folder = await pickFolder()
                if (folder) {
                    const files = await scanDirectory(folder, true).catch(() => [])
                    if (files.length) setQueue(files, 0)
                }
            } else {
                const paths = await pickVideoFiles(true)
                if (paths.length) {
                    const files = (await Promise.all(paths.map((p) => getMediaInfo(p).catch(() => null)))).filter(
                        Boolean,
                    ) as Awaited<ReturnType<typeof getMediaInfo>>[]
                    if (files.length) setQueue(files, 0)
                }
            }
        }
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
            e.preventDefault()
            openShortcuts()
        }
    })
    return null
}

function DropZone() {
    const setQueue = usePlaylistStore((s) => s.setQueue)

    React.useEffect(() => {
        let unlisten: UnlistenFn | undefined
            ; (async () => {
                try {
                    unlisten = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
                        const paths = event.payload?.paths ?? []
                        if (!paths.length) return
                        const files = (
                            await Promise.all(paths.map((p) => getMediaInfo(p).catch(() => null)))
                        ).filter(Boolean) as Awaited<ReturnType<typeof getMediaInfo>>[]
                        if (files.length) {
                            setQueue(files, 0)
                            toast.success(`Loaded ${files.length} file${files.length > 1 ? 's' : ''}`)
                        }
                    })
                } catch {
                    /* not in tauri */
                }
            })()
        return () => {
            unlisten?.()
        }
    }, [setQueue])

    return null
}

export function App() {
    return (
        <Providers>
            <GlobalShortcuts />
            <DropZone />
            <AppRouter />
        </Providers>
    )
}
