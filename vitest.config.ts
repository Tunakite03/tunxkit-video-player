import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Stores persist through localStorage, which happy-dom provides.
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
