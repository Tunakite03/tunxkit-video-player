import { Moon, Sun, Monitor } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { useTheme } from './theme-provider'

export function ThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme()
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton label="Theme" size="icon-sm">
                    {resolvedTheme === 'dark' ? (
                        <Moon className="h-4 w-4" />
                    ) : (
                        <Sun className="h-4 w-4" />
                    )}
                </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem
                    onSelect={() => setTheme('light')}
                    aria-checked={theme === 'light'}
                >
                    <Sun className="mr-2 h-4 w-4" /> Light
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => setTheme('dark')}
                    aria-checked={theme === 'dark'}
                >
                    <Moon className="mr-2 h-4 w-4" /> Dark
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => setTheme('system')}
                    aria-checked={theme === 'system'}
                >
                    <Monitor className="mr-2 h-4 w-4" /> System
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
