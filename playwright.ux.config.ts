import { defineConfig } from "@playwright/test";

/**
 * UX-01 baseline checks. Deliberately has no `webServer`: it never starts
 * `npm run dev` (which prepares the configured database). Start the disposable
 * review server first with `npm run ux:review`.
 */
export default defineConfig({
  testDir: "./tests/ux",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://localhost:3100",
    channel: process.platform === "win32" ? "msedge" : undefined,
    headless: true,
    screenshot: "only-on-failure",
  },
});
