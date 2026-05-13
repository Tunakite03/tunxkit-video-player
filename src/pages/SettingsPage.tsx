import { ScrollArea } from '@/components/ui/scroll-area'
import { SettingsView } from '@/features/settings/components/SettingsView'

export function SettingsPage() {
    return (
        <ScrollArea className="h-full w-full">
            <SettingsView />
        </ScrollArea>
    )
}
