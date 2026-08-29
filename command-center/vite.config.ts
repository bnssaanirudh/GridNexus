import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
// ASSUMPTION (Prompt 25): Vitest config lives here for simplicity; the `test`
// key is type-safe only with the vitest/config import.
// Using `as any` to keep the single-file config without requiring the separate
// @vitest/plugin-react import chain that conflicts with vite's UserConfigExport.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
} as any);
