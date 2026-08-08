import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against the system Chrome (`channel: "chrome"`), so
 * Playwright downloads no browsers and needs no `install-deps` — which
 * matters here because that step wants root.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
  ],

  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/ja",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
