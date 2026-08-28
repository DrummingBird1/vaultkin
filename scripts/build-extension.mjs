#!/usr/bin/env node
/**
 * @file scripts/build-extension.mjs
 * Bundles the browser extension (extension/) into dist/extension/.
 *
 * Previously extension/ had no build step at all — Chrome loaded the plain
 * JS files directly unbundled. That still works today (nothing here changes
 * what a developer loading extension/ as an unpacked extension gets), but
 * it's also how EXTENSION_SESSION_TIMEOUT_MS ended up hand-duplicated
 * between here and the main app before src/constants/shared.json existed
 * (see CLAUDE.md invariant #9) — no bundler meant no easy way to share code
 * across that boundary. This gives the extension a real (if minimal) build
 * output for CI validation and eventual Chrome Web Store packaging, without
 * changing the source layout: dist/extension/ mirrors extension/ exactly
 * (manifest.json's relative paths — src/background.js, popup/popup.html,
 * etc. — work unmodified against the bundled output).
 *
 * background.js is bundled as ESM (matches manifest.json's
 * background.type: "module") so its JSON import of shared.json resolves
 * and gets inlined. content.js and popup.js are plain classic scripts (no
 * "type": "module" in manifest for either) — bundled as IIFE.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cpSync, mkdirSync, existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "extension");
const outDir = path.join(root, "dist", "extension");

mkdirSync(outDir, { recursive: true });

// Static assets copied as-is.
const staticEntries = [
  "manifest.json",
  "icons",
  "src/content.css",
  "popup/popup.html",
  "popup/popup.css",
];
for (const entry of staticEntries) {
  const from = path.join(srcDir, entry);
  const to = path.join(outDir, entry);
  if (!existsSync(from)) {
    console.error(`Missing expected extension file: ${entry}`);
    process.exit(1);
  }
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

await build({
  entryPoints: [path.join(srcDir, "src", "background.js")],
  outfile: path.join(outDir, "src", "background.js"),
  bundle: true,
  format: "esm",
  target: "chrome110",
  minify: true,
  sourcemap: true,
});

await build({
  entryPoints: [path.join(srcDir, "src", "content.js")],
  outfile: path.join(outDir, "src", "content.js"),
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: true,
  sourcemap: true,
});

await build({
  entryPoints: [path.join(srcDir, "popup", "popup.js")],
  outfile: path.join(outDir, "popup", "popup.js"),
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: true,
  sourcemap: true,
});

console.log(`Extension bundled to ${path.relative(root, outDir)}/`);
