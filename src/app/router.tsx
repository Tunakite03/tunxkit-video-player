import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import * as React from 'react'
import { AppShell } from '@/components/layout/AppShell'

const HomePage = React.lazy(() =>
    import('@/pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const PlayerPage = React.lazy(() =>
    import('@/pages/PlayerPage').then((m) => ({ default: m.PlayerPage })),
)
const LibraryPage = React.lazy(() =>
    import('@/pages/LibraryPage').then((m) => ({ default: m.LibraryPage })),
)
const SettingsPage = React.lazy(() =>
    import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

function Loading() {
    return (
        <div className="flex h-full w-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
    )
}

const wrap = (node: React.ReactNode) => (
    <React.Suspense fallback={<Loading />}>{node}</React.Suspense>
)

export const router = createBrowserRouter([
    {
        path: '/',
        element: <AppShell />,
        children: [
            { index: true, element: wrap(<HomePage />) },
            { path: 'player', element: wrap(<PlayerPage />) },
            { path: 'library', element: wrap(<LibraryPage />) },
            { path: 'settings', element: wrap(<SettingsPage />) },
        ],
    },
])

export function AppRouter() {
    return <RouterProvider router={router} />
}
