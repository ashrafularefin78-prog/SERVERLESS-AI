import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const preview = process.env.PLAYWRIGHT_PREVIEW === "1";

// Chromium is the shipping target and the only browser CI runs. The IndexedDB and
// storage paths are the ones that differ most between engines, so a Firefox or
// WebKit pass is worth running by hand before a release:
//   PLAYWRIGHT_BROWSERS=firefox,webkit npm run test:e2e
const extraBrowsers = (process.env.PLAYWRIGHT_BROWSERS ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name === "firefox" || name === "webkit");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...extraBrowsers.map((name) => ({
      name,
      use: { ...devices[name === "firefox" ? "Desktop Firefox" : "Desktop Safari"] },
    })),
  ],
  webServer: {
    command: preview
      ? `npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`
      : `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
