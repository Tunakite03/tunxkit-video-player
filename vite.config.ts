import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(
  () =>
    ({
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          "@": path.resolve(import.meta.dirname, "./src"),
        },
      },
      // Prevent vite from obscuring rust errors
      clearScreen: false,
      server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
        watch: {
          // Keep Vite from full-reloading when dev/runtime tools update files
          // outside the frontend source tree. Tauri watches `src-tauri` itself,
          // while local index/cache files such as `.vexp` can change every few
          // seconds and otherwise look like source changes to Vite.
          ignored: [
            "**/src-tauri/**",
            "**/.vexp/**",
            "**/.codebase/**",
            "**/.claude/**",
            "**/.cursor/**",
            "**/.zed/**",
            "**/.git/**",
            "**/dist/**",
            "**/node_modules/**",
          ],
        },
      },
      envPrefix: ["VITE_", "TAURI_ENV_*"],
      build: {
        // Tailwind CSS 4 needs Chrome 111 / Safari 16.4; nothing older renders the UI.
        target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome111" : "safari16.4",
        minify: process.env.TAURI_ENV_DEBUG ? false : "oxc",
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
      },
    }) satisfies UserConfig,
);
