# Tunxkit Player

A fast, modern desktop video player built with [Tauri 2](https://v2.tauri.app), React 19 and TypeScript. Videos play in the system webview: WebView2 on Windows, WKWebView on macOS and WebKitGTK on Linux.

## Features

- Play local files from the file picker, drag & drop, "Open with" or the command line. If the app is already running, a second launch hands its files to the open window.
- A queue with shuffle (each track plays once per cycle), repeat all/one, and history-aware "previous".
- A library built from folders you add, with lazily generated thumbnails and search.
- Resume from the last position, plus a list of recently played files.
- Fullscreen, picture-in-picture, frame stepping, playback speed from 0.25× to 2×, and a full set of keyboard shortcuts (press `?` in the app to see them).
- Light and dark themes.

## Supported formats

| Container                   | Windows | Linux | macOS |
| --------------------------- | :-----: | :---: | :---: |
| `mp4`, `m4v`, `mov`, `webm` |    ✓    |   ✓   |   ✓   |
| `mkv`, `ogv`                |    ✓    |   ✓   |   –   |

The list lives in [`src-tauri/video-extensions.json`](src-tauri/video-extensions.json). Whether a particular file plays still depends on the codecs the platform's webview supports. On Linux that means the GStreamer plugins you have installed.

A single folder scan returns at most 10,000 videos. If it stops there, the app shows a warning.

## Keyboard shortcuts

| Keys                  | Action                               |
| --------------------- | ------------------------------------ |
| `Space` / `K`         | Play / pause                         |
| `←` / `→`             | Seek by the seek step (default 5 s)  |
| `J` / `L`             | Seek by the long step (default 10 s) |
| `,` / `.`             | Step one frame back / forward        |
| `0`–`9`               | Jump to 0–90%                        |
| `Home` / `End`        | Jump to start / end                  |
| `↑` / `↓`             | Volume up / down                     |
| `M`                   | Mute                                 |
| `<` / `>`             | Slower / faster                      |
| `Shift+N` / `Shift+P` | Next / previous in the queue         |
| `F`                   | Fullscreen                           |
| `P`                   | Picture-in-picture                   |
| `Q`                   | Toggle the playlist                  |
| `Ctrl+O`              | Open files                           |
| `Ctrl+Shift+O`        | Open a folder                        |
| `?`                   | Show all shortcuts                   |

## Development

You need Node.js 24, a stable Rust toolchain and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
npm install
npm run tauri dev      # run the app with hot reload
npm run tauri build    # build installers into src-tauri/target/release/bundle
```

Checks (these are what CI runs):

```bash
npm run format:check && npm run lint && npm test && npm run build
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

### Project layout

```
src/
  app/          App root, providers, router, OS file events, drag & drop
  features/     player, playlist, library and settings (components + zustand stores)
  components/   layout, dialogs and shared UI primitives (Radix + Tailwind)
  hooks/, lib/  shared hooks, Tauri wrappers, thumbnails, formatting
src-tauri/
  src/commands/media.rs   scanning, file metadata, media access, opened-file queue
  src/media_protocol.rs   media:// byte-range streaming of granted videos
  tauri.conf.json         app config; tauri.macos.conf.json overrides it on macOS
```

### Security model

Videos stream through the app's own `media://` protocol, which starts with nothing granted. The backend grants access only to the files it returns from a media command, so the webview can't stream anything else. The production CSP allows no network connections beyond Tauri IPC.

### Releasing

The version comes from `package.json`, which `tauri.conf.json` reads. `src-tauri/Cargo.toml` has its own copy, and a test fails if the two differ, so bump both together.

## License

[MIT](LICENSE)
