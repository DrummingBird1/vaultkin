/**
 * Playwright config for the Electron desktop app (pnpm test:e2e:electron).
 * Separate from the browser E2E config: it launches the real Electron main
 * process against the Vite dev server, with a throwaway profile directory.
 * Requires `pnpm build:electron` first (the script does it).
 */
import { defineConfig } from "@playwright/test";
import path from "path";

const root = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: path.resolve(root, "e2e-electron"),
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"]] : "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "pnpm run dev",
    cwd: root,
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
