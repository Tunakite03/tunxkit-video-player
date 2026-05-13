import * as React from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
    theme: Theme
    resolvedTheme: 'light' | 'dark'
    setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)
const STORAGE_KEY = 'tunxkit.theme'

function getSystemTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: 'light' | 'dark') {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
}

export function ThemeProvider({
    children,
    defaultTheme = 'dark',
}: {
    children: React.ReactNode
    defaultTheme?: Theme
}) {
    const [theme, setThemeState] = React.useState<Theme>(() => {
        if (typeof window === 'undefined') return defaultTheme
        return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? defaultTheme
    })

    const [systemTheme, setSystemTheme] = React.useState<'light' | 'dark'>(getSystemTheme)
    const resolvedTheme = theme === 'system' ? systemTheme : theme

    React.useEffect(() => {
        applyTheme(resolvedTheme)
        localStorage.setItem(STORAGE_KEY, theme)
    }, [resolvedTheme, theme])

    React.useEffect(() => {
        if (theme !== 'system') return
        const mql = window.matchMedia('(prefers-color-scheme: dark)')
        const onChange = () => {
            setSystemTheme(mql.matches ? 'dark' : 'light')
        }
        mql.addEventListener('change', onChange)
        return () => mql.removeEventListener('change', onChange)
    }, [theme])

    const value = React.useMemo<ThemeContextValue>(
        () => ({ theme, resolvedTheme, setTheme: setThemeState }),
        [theme, resolvedTheme],
    )

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
    const ctx = React.useContext(ThemeContext)
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
    return ctx
}
