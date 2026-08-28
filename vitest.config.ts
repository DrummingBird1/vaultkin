/**
 * @file vitest.config.ts
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
  plugins: [react()],

  test: {
    globals:     true,
    environment: "jsdom",
    setupFiles:  ["./tests/setup.ts"],

    // Coverage
    coverage: {
      provider:   "v8",
      reporter:   ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include:    ["src/**/*.{ts,tsx}"],
      exclude:    [
        "src/**/*.stories.*",
        "src/**/*.demo.*",
        "src/main.tsx",
        "src/electron/**",
        "src/workers/**",
        "src/pwa/**",
      ],
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  75,
        statements:80,
      },
    },

    // Test file patterns
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", "release"],

    // Timeout: integration tests can be slow due to crypto ops
    testTimeout: 30_000,

    // Reporter
    reporter: process.env.CI ? ["verbose", "junit"] : ["verbose"],
    outputFile: process.env.CI ? "./test-results/junit.xml" : undefined,
  },

  resolve: {
    alias: {
      "@core":       path.resolve(__dirname, "src/core"),
      "@services":   path.resolve(__dirname, "src/services"),
      "@store":      path.resolve(__dirname, "src/store"),
      "@components": path.resolve(__dirname, "src/components"),
      "@hooks":      path.resolve(__dirname, "src/hooks"),
      "@pages":      path.resolve(__dirname, "src/pages"),
    },
  },
});
