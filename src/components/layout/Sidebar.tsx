import { NavLink } from 'react-router-dom'
import { Home, Library, Settings, Keyboard, PlayCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useUIStore } from '@/stores/ui-store'

const items = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/player', label: 'Player', icon: PlayCircle },
    { to: '/library', label: 'Library', icon: Library },
    { to: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
    hidden?: boolean
}

export function Sidebar({ hidden = false }: SidebarProps) {
    const open = useUIStore((s) => s.sidebarOpen)
    const openShortcuts = useUIStore((s) => s.openShortcuts)

    return (
        <aside
            className={cn(
                'flex h-full shrink-0 flex-col overflow-hidden bg-surface/40 transition-[width,opacity] duration-200',
                hidden ? 'w-0 border-r-0 opacity-0 pointer-events-none' : 'border-r border-border opacity-100',
                !hidden && (open ? 'w-56' : 'w-14.5'),
            )}
            aria-hidden={hidden}
        >
            <div className="flex items-center gap-2 px-3 py-3">
                <div className="grid h-8 w-8 place-items-center rounded-md bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-soft">
                    <PlayCircle className="h-5 w-5" />
                </div>
                {open && (
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-tight">Tunxkit</div>
                        <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                            Player
                        </div>
                    </div>
                )}
            </div>
            <nav className="flex flex-1 flex-col gap-2.5 px-2">
                {items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) =>
                            cn(
                                'flex h-9 items-center gap-3 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                                isActive && 'bg-accent text-accent-foreground',
                            )
                        }
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        {open && <span className="truncate">{label}</span>}
                    </NavLink>
                ))}
            </nav>
            <div className="px-2 pb-2">
                <button
                    onClick={openShortcuts}
                    className="flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    <Keyboard className="h-4 w-4 shrink-0" />
                    {open && <span>Shortcuts</span>}
                </button>
            </div>
        </aside>
    )
}
