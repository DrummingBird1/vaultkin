/**
 * @file config/tailwind.config.cjs
 * Content globs MUST be absolute (path.resolve from __dirname), not relative
 * ("./src/**\/*.{ts,tsx}") — Tailwind resolves relative content globs
 * against the process's CWD, not this config file's own directory. That's
 * fine while this file lived at the project root (CWD when running
 * `pnpm run dev`/`build`), but once it moved into config/, relative globs
 * here silently matched nothing (CWD is still the project root, so
 * "./src/**" from *this* file's perspective pointed at config/src/, which
 * doesn't exist) — Tailwind doesn't error on an empty content match, it just
 * emits a stylesheet with none of the utility classes actually used,
 * producing an unstyled app with no build error to explain why.
 */
const path = require("path");
const root = path.resolve(__dirname, "..");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(root, "index.html"),
    path.join(root, "src/**/*.{ts,tsx}"),
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Outfit", "system-ui", "sans-serif"],
        mono:    ["DM Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
