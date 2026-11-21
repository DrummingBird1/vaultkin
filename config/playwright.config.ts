/**
 * Playwright E2E config for Vaultkin.
 *
 * Runs the full unlock → vault → lock cycle in a real Chromium browser
 * against a Vite dev server. No mocks; uses the actual WebCrypto stack.
 */
import { defineConfig, devices } from "@playwright/test";
import path from "path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";
const root = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: path.resolve(root, "e2e"),
  timeout: 60_000, // crypto ops can be slow; allow 60s per test
  expect: { timeout: 5_000 },
  fullyParallel: false, // tests share IndexedDB; serialize for safety
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm run dev",
        cwd: root,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
