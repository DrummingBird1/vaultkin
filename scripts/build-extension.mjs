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
import { cpSync, mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "extension");
const outDir = path.join(root, "dist", "extension");

// Start clean so files removed from the source don't linger in the package.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Static assets copied as-is.
const staticEntries = ["manifest.json", "_locales", "icons", "popup/popup.html", "popup/popup.css"];
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
  entryPoints: [path.join(srcDir, "src", "content.ts")],
  outfile: path.join(outDir, "src", "content.js"),
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: true,
  sourcemap: true,
});

// Runs in the page's world (manifest "world": "MAIN"): passkey provider shim.
await build({
  entryPoints: [path.join(srcDir, "src", "webauthn-inject.ts")],
  outfile: path.join(outDir, "src", "webauthn-inject.js"),
  bundle: true,
  format: "iife",
  target: "chrome111",
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

// ── Release mode (`--release`): store packages carry no dev hosts ─────────
// externally_connectable only exists for the dev web build on localhost; the
// desktop app talks to the extension over native messaging (ADR 0007).
const RELEASE = process.argv.includes("--release");
if (RELEASE) {
  const mPath = path.join(outDir, "manifest.json");
  const m = JSON.parse(readFileSync(mPath, "utf8"));
  delete m.externally_connectable;
  if (m.content_security_policy?.extension_pages)
    m.content_security_policy.extension_pages = m.content_security_policy.extension_pages.replace(
      / ?http:\/\/localhost:5173/g,
      "",
    );
  writeFileSync(mPath, JSON.stringify(m, null, 2));
  console.log("Release manifest: dev hosts removed");
}

// ── Firefox package ─────────────────────────────────────────────────────────
// Same bundles; the manifest differs: background scripts instead of a service
// worker, a fixed add-on id (native messaging allows it by id), no
// externally_connectable (unsupported), MAIN-world content scripts need 128+.
export const FIREFOX_ID = "securevault@securevault.app";
const ffDir = path.join(root, "dist", "extension-firefox");
rmSync(ffDir, { recursive: true, force: true });
cpSync(outDir, ffDir, { recursive: true });
const ff = JSON.parse(readFileSync(path.join(outDir, "manifest.json"), "utf8"));
ff.background = { scripts: [ff.background.service_worker], type: "module" };
delete ff.externally_connectable;
ff.browser_specific_settings = { gecko: { id: FIREFOX_ID, strict_min_version: "128.0" } };
if (ff.content_security_policy?.extension_pages)
  ff.content_security_policy.extension_pages = ff.content_security_policy.extension_pages.replace(
    / ?http:\/\/localhost:5173/g,
    "",
  );
writeFileSync(path.join(ffDir, "manifest.json"), JSON.stringify(ff, null, 2));
console.log(`Firefox package in ${path.relative(root, ffDir)}/`);
