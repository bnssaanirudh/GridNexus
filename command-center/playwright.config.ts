import { defineConfig, devices } from "@playwright/test";

/**
 * command-center/playwright.config.ts
 * ─────────────────────────────────────
 * Prompt 25 – Playwright configuration for e2e tests.
 *
 * The webServer block serves the built dist/ so tests run against the
 * production bundle (identical to what Lighthouse would audit).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:4173",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx serve dist -p 4173 --no-clipboard",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
