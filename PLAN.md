# Tunxkit Player — Implementation Plan

A native desktop video player built on **Tauri v2 + React 19 + TypeScript + Tailwind v4**.
Architecture follows a _feature-sliced lite_ (Bulletproof-React style) layout for easy scaling.

---

## Tech stack

| Layer         | Choice                                                               |
| ------------- | -------------------------------------------------------------------- |
| Shell         | Tauri 2.11 (Rust)                                                    |
| UI            | React 19 + Vite 8 (rolldown / oxc minifier)                          |
| Styling       | Tailwind CSS v4 (`@tailwindcss/vite`) + CSS variables (OKLCH)        |
| Primitives    | Radix UI (Slider, Tooltip, DropdownMenu, Switch, Dialog, ScrollArea) |
| State         | Zustand + immer + `persist`                                          |
| Routing       | react-router-dom v6                                                  |
| Icons         | lucide-react                                                         |
| Notifications | sonner                                                               |
| File system   | `@tauri-apps/plugin-fs` + custom Rust commands                       |

---

## Folder structure

```
src/
├─ app/                  Application entry: providers, router, root App
├─ components/
│  ├─ dialogs/           Cross-cutting dialogs (e.g. ShortcutsHelp)
│  ├─ layout/            AppShell, Sidebar, TitleBar
│  ├─ theme/             ThemeProvider + ThemeToggle
│  └─ ui/                Headless primitives (button, slider, dialog, …)
├─ features/
│  ├─ library/           Folder-based library: store, components
│  ├─ player/            Video player: store, hooks, components
│  ├─ playlist/          Queue / recents: store, components
│  └─ settings/          User preferences: store, components
├─ hooks/                Reusable hooks (use-idle, use-keyboard-shortcuts)
├─ lib/                  Pure helpers (cn, format, tauri bridge, shortcuts)
├─ pages/                Route pages (Home, Player, Library, Settings)
├─ stores/               Cross-feature stores (ui-store)
├─ styles/               globals.css (Tailwind v4)
└─ types/                Shared types

src-tauri/
├─ src/
│  ├─ commands/          scan_directory, get_media_info, show_in_folder
│  ├─ error.rs           AppError + serde Serialize
│  └─ lib.rs             plugins + invoke handlers
├─ capabilities/         default.json permissions
└─ tauri.conf.json
```

---

## Phases

### Phase 1 — Scaffold ✅

- `npm create vite` (React + TS), then `tauri init` with `com.tunxkit.videoplayer` identifier
- Window 1280×800 (min 880×540), hidden on launch, shown via `setup`
- Plugins enabled: fs, dialog, opener, store, os, window-state, log
- `tauri = { features = ["protocol-asset"] }`; CSP allows `asset:` / `blob:` for media-src
- Release profile: LTO, `opt-level = "s"`, strip, panic=abort

### Phase 2 — Design system + theme ✅

- Tailwind v4 via `@tailwindcss/vite`; `@theme {}` tokens + `@custom-variant dark`
- OKLCH brand palette (`brand-50…900`, violet 280° hue)
- Semantic tokens: `--background`, `--foreground`, `--card`, `--muted`, `--primary`, `--accent`, `--border`, `--ring`, `--input`
- `.dark` overrides + auto `colorScheme`
- Headless UI primitives in `components/ui/*` (CVA + tailwind-merge)
- `ThemeProvider` (light/dark/system) persisted to `tunxkit.theme`

### Phase 3 — Architecture skeleton ✅

- Stores under `features/*/store.ts` + cross-cutting `stores/ui-store.ts`
- Persistence keys: `tunxkit.{theme, ui, settings, playlist, player, library}`
- Hooks: `useKeyboardShortcuts`, `useIdle`, `useVideoController`
- Router: `BrowserRouter` with routes `/`, `/player`, `/library`, `/settings`
- `Providers` (Theme + Tooltip + Toaster); `AppShell` wraps Outlet with Sidebar + TitleBar

### Phase 4 — Core player ✅

- `<Player />` orchestrates an `HTMLVideoElement` + `useVideoController` (events → store)
- Custom controls bar (`PlayerControls`) with auto-hide via `useIdle`
- `SeekBar` with buffered hint, `VolumeControl` hover-reveal
- Full keyboard map (Space, ←/→, J/L, ↑/↓, M, F, P, [/], 0–9, < / >)
- Resume from last position (saved every 5 s once seconds > 5)
- Autoplay next on `ended` (respects `autoplayNext` setting)
- Picture-in-Picture, fullscreen API, click-to-toggle, double-click fullscreen
- Empty state when queue is empty

### Phase 5 — Rust backend commands ✅

- `scan_directory(path, recursive) -> Vec<MediaFile>` via walkdir, filters by ext, sorts alphabetically
- `get_media_info(path) -> MediaFile`
- `show_in_folder(path)` with Windows `explorer /select,` / macOS `open -R` / Linux `xdg-open`
- `AppError` impls `serde::Serialize` for typed errors in the frontend

### Phase 6 — Library + thumbnails 🔄

- Folder-based library: add/remove folder, recursive scan, dedupe by path
- Grid view with search (`features/library/components/LibraryView.tsx`)
- **Thumbnails** generated client-side via offscreen `<video>` + `<canvas>`:
  - Seek to a representative offset, draw to canvas, export as `image/jpeg` dataURL
  - In-memory LRU cache keyed by path (size bounded so memory stays sane)
  - Concurrency limited to N workers to keep UI smooth
  - Lazy: only generate when a card enters the viewport (`IntersectionObserver`)
- Show duration on the card once metadata loads

### Phase 7 — Settings, shortcuts, perf

- Settings UI: volume, resume, autoplay, seek steps, recursive scan (Radix Switch)
- `ShortcutsHelp` dialog opened with `?`
- **Perf polish**:
  - Lazy-load route components (`React.lazy` + `Suspense`)
  - Keep main bundle below ~400 kB gzipped where possible
  - Memo selectors and split Zustand selectors to avoid re-renders
- Toast notifications for drag-drop loads (sonner)

### Phase 8 — Build & packaging

- Bundle metadata (`productName`, `version`, `category`, `shortDescription`, `longDescription`, `copyright`)
- App identifier `com.tunxkit.videoplayer` (set)
- Window-state plugin retains last size/position
- Icons: regenerate from a source PNG via `npx tauri icon`
- Targets: `msi` + `nsis` on Windows; `dmg` on macOS; `deb` + `appimage` on Linux
- Verify `cargo check`, `npm run build`, `npm run tauri build`

---

## Keyboard shortcuts

| Group    | Action              | Keys             |
| -------- | ------------------- | ---------------- |
| Playback | Play / pause        | Space, K         |
| Playback | Stop                | Esc              |
| Seek     | ±5 s                | ←, →             |
| Seek     | ±10 s               | J, L             |
| Seek     | Jump to 0–90 %      | 0–9              |
| Volume   | ±5 %                | ↑, ↓             |
| Volume   | Mute                | M                |
| View     | Fullscreen          | F                |
| View     | Picture-in-Picture  | P                |
| Rate     | Decrease / increase | < / >            |
| File     | Open files          | Ctrl/Cmd+O       |
| File     | Open folder         | Ctrl/Cmd+Shift+O |
| Help     | Show shortcuts      | ?                |

---

## Storage keys (localStorage)

| Key                | Owner                        |
| ------------------ | ---------------------------- |
| `tunxkit.theme`    | `ThemeProvider`              |
| `tunxkit.ui`       | `stores/ui-store.ts`         |
| `tunxkit.settings` | `features/settings/store.ts` |
| `tunxkit.playlist` | `features/playlist/store.ts` |
| `tunxkit.player`   | `features/player/store.ts`   |
| `tunxkit.library`  | `features/library/store.ts`  |

---

## Review checkpoints

Each phase ends with a short review:

1. **What was built** — file list + key APIs
2. **Verification** — `tsc -b`, `vite build`, `cargo check`
3. **Known caveats / follow-ups**
4. **Next phase** preview
