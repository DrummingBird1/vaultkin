/**
 * @file config/vitest.config.ts
 * @description Vitest configuration for unit + integration tests.
 *
 * Environment: jsdom (simulates browser APIs for Web Crypto, DOM, etc.)
 * Coverage: v8 provider, targets src/ excluding demo/story files.
 * Globals: true — no import { describe, it, expect } needed.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, ".."),
  plugins: [react()],

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "../tests/setup.ts")],

    // Coverage
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: path.resolve(__dirname, "../coverage"),
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.stories.*",
        "src/**/*.demo.*",
        "src/main.tsx",
        "src/electron/**",
        "src/workers/**",
        "src/pwa/**",
      ],
      // Two levels. The logic core (crypto encoding, passwords, TOTP, the vault
      // engine and serializer) is held just under where it is today (98% lines,
      // 92% branches in Nov 2026), so a drop in its tests fails CI. The rest is
      // mostly UI with no component tests yet: its floor is today's level and
      // only goes up as tests are added. Never lower either to make a PR pass.
      thresholds: {
        lines: 17,
        functions: 11,
        branches: 13,
        statements: 16,
        "src/core/**": {
          lines: 95,
          functions: 90,
          branches: 85,
          statements: 90,
        },
      },
    },

    // Test file patterns
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", "release"],

    // Timeout: integration tests can be slow due to crypto ops
    testTimeout: 30_000,

    // Reporter
    reporter: process.env.CI ? ["verbose", "junit"] : ["verbose"],
    outputFile: process.env.CI ? path.resolve(__dirname, "../test-results/junit.xml") : undefined,
  },

  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "../src/core"),
      "@services": path.resolve(__dirname, "../src/services"),
      "@store": path.resolve(__dirname, "../src/store"),
      "@components": path.resolve(__dirname, "../src/components"),
      "@hooks": path.resolve(__dirname, "../src/hooks"),
      "@pages": path.resolve(__dirname, "../src/pages"),
    },
  },
});
