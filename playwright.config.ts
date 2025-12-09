import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // Run tests sequentially to share server
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker since we share the server
  reporter: "html",
  // In CI, create missing snapshots instead of failing (for cross-platform support)
  updateSnapshots: process.env.CI ? "missing" : "none",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Use system Chrome on macOS for stability, default chromium in CI
          ...(process.platform === "darwin" ? { channel: "chrome" } : {}),
        },
      },
    },
  ],
  // Run examples server before tests
  webServer: {
    command: "npm run examples:start",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  // Snapshot configuration
  expect: {
    toHaveScreenshot: {
      // Allow 2% pixel difference for dynamic content (timestamps, etc.)
      maxDiffPixelRatio: 0.02,
      // Animation stabilization
      animations: "disabled",
    },
  },
});
