import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// rollup-plugin-visualizer is ESM-only, and this config file is loaded as
// CommonJS (no "type": "module" in package.json) — a static top-level import
// fails with "this package is ESM only" even when BUILD_ANALYZE is unset,
// because the import itself is eager. A dynamic import sidesteps the
// loader mismatch and also means the plugin's cost isn't paid on every
// normal build, only when actually requested.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join("; ");

export default defineConfig(async () => ({
  root: path.resolve(__dirname, ".."),
  plugins: [
    // Production CSP (dev is left alone: React Refresh injects inline script).
    // 'wasm-unsafe-eval' is for Argon2 (hash-wasm); connect-src https: covers
    // the HIBP range API and the user's own WebDAV server (https only).
    {
      name: "sv-csp",
      apply: "build" as const,
      transformIndexHtml: (html: string) =>
        html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        ),
    },
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt" (not "autoUpdate"): a new service worker installs in the
      // background but does NOT self-activate and force-reload the page.
      // This app already had one production data-loss bug from a component
      // reloading/resetting state out from under an in-progress vault edit
      // (see CLAUDE.md invariant #12, the lockApplication/autosave race) —
      // an auto-reloading SW is the exact same failure shape, so registration
      // in src/main.tsx only ever informs the user, never forces a reload.
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "SecureVault",
        short_name: "SecureVault",
        description: "Zero-knowledge password manager and 2FA authenticator.",
        theme_color: "#0D0D12",
        background_color: "#0D0D12",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Precache only the built app shell (JS/CSS/HTML/icons). Deliberately
        // no runtimeCaching entries: this app talks to the HIBP breach-check
        // API and the user's own WebDAV server, and neither should ever be
        // served from a cache — stale breach data is misleading, and a
        // cached WebDAV response could desync a sync conflict check that
        // depends on a live ETag.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
    // Opt-in bundle size report: `BUILD_ANALYZE=true pnpm run build` (or
    // `pnpm run build:analyze`) writes dist/renderer/stats.html instead of
    // adding the visualizer's overhead to every normal build.
    process.env.BUILD_ANALYZE === "true" &&
      (await import("rollup-plugin-visualizer")).visualizer({
        filename: path.resolve(__dirname, "../dist/renderer/stats.html"),
        gzipSize: true,
        brotliSize: true,
      }),
  ],
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
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist/renderer",
    // "hidden": .map files are still emitted (useful for manually
    // symbolicating a minified stack trace a user pastes in) but the bundle
    // carries no `//# sourceMappingURL` comment, so browser devtools don't
    // auto-fetch and display original source structure by default.
    sourcemap: "hidden",
    target: "es2022",
  },
}));
