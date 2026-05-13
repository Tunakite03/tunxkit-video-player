import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SHORTCUTS } from '@/lib/shortcuts'
import { useUIStore } from '@/stores/ui-store'

export function ShortcutsHelp() {
    const open = useUIStore((s) => s.shortcutsHelpOpen)
    const closeShortcuts = useUIStore((s) => s.closeShortcuts)
    const groups = SHORTCUTS.reduce<Record<string, typeof SHORTCUTS>>((acc, s) => {
        ; (acc[s.group] ||= []).push(s)
        return acc
    }, {})

    return (
        <Dialog open={open} onOpenChange={(v) => !v && closeShortcuts()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Keyboard shortcuts</DialogTitle>
                    <DialogDescription>
                        All shortcuts work while a video has focus.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[min(60vh,32rem)]">
                    <div className="grid gap-6 pb-1 pr-4 sm:grid-cols-2 sm:gap-x-8">
                        {Object.entries(groups).map(([group, list]) => (
                            <div key={group}>
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {group}
                                </h3>
                                <ul className="space-y-1.5">
                                    {list.map((s) => (
                                        <li key={s.keys} className="flex items-center justify-between gap-4 text-sm">
                                            <span className="min-w-0 text-foreground/80">{s.description}</span>
                                            <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                                                {s.keys}
                                            </kbd>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
