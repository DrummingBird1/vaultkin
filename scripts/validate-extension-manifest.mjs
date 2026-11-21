#!/usr/bin/env node
/**
 * @file scripts/validate-extension-manifest.mjs
 * Validates extension/manifest.json against Chrome Web Store's hard
 * constraints (things that get a submission flat-out rejected) plus a few
 * soft warnings for this project's own conventions. Not a full MV3 schema
 * validator — just the checks that are cheap to get right and expensive to
 * discover by having a real submission bounce.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "extension", "manifest.json");

let errors = 0;
let warnings = 0;
function fail(message) {
  console.error(`✖ ${message}`);
  errors++;
}
function warn(message) {
  console.warn(`⚠ ${message}`);
  warnings++;
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.error(`Could not read/parse ${manifestPath}: ${e.message}`);
  process.exit(1);
}

// ─── Hard Chrome Web Store constraints ─────────────────────────────────────

if (manifest.manifest_version !== 3) {
  fail(`manifest_version must be 3, got ${manifest.manifest_version}`);
}

if (!manifest.name || typeof manifest.name !== "string") {
  fail("name is required");
} else if (manifest.name.length > 75) {
  fail(`name is ${manifest.name.length} chars, Chrome Web Store limit is 75`);
}

if (!manifest.description) {
  fail("description is required");
} else if (manifest.description.length > 132) {
  fail(`description is ${manifest.description.length} chars, Chrome Web Store limit is 132`);
}

if (!manifest.version || !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
  fail(`version must be 1-4 dot-separated non-negative integers, got "${manifest.version}"`);
}

if (!manifest.icons || !manifest.icons["128"]) {
  fail('icons["128"] is required for Chrome Web Store listing');
}
for (const [size, iconPath] of Object.entries(manifest.icons ?? {})) {
  const resolved = path.join(root, "extension", iconPath);
  if (!existsSync(resolved)) {
    fail(`icons["${size}"] points to "${iconPath}", which doesn't exist`);
  }
}

// MV3 requires the CSP under extension_pages, not a bare top-level string
// (that was the MV2 shape) — a common migration mistake.
if (typeof manifest.content_security_policy === "string") {
  fail(
    'content_security_policy must be an object with "extension_pages" (MV2-style bare string is not valid in MV3)',
  );
}

if (manifest.background && !manifest.background.service_worker) {
  fail("background is present but missing service_worker");
}
if (manifest.background?.service_worker) {
  const swPath = path.join(root, "extension", manifest.background.service_worker);
  if (!existsSync(swPath)) {
    fail(
      `background.service_worker points to "${manifest.background.service_worker}", which doesn't exist`,
    );
  }
}

for (const [i, cs] of (manifest.content_scripts ?? []).entries()) {
  for (const jsPath of cs.js ?? []) {
    // TypeScript sources are bundled to the .js the manifest names (build-extension.mjs).
    const src = path.join(root, "extension", jsPath);
    if (!existsSync(src) && !existsSync(src.replace(/\.js$/, ".ts"))) {
      fail(`content_scripts[${i}].js references "${jsPath}", which doesn't exist`);
    }
  }
}

// ─── Soft warnings (this project's own conventions) ────────────────────────

if (manifest.host_permissions?.includes("<all_urls>")) {
  warn(
    'host_permissions includes "<all_urls>" — broad, but expected here for autofill on arbitrary sites; make sure that\'s still intentional if this fires.',
  );
}

if (JSON.stringify(manifest).includes("your-securevault-host.com")) {
  fail("manifest still contains the your-securevault-host.com placeholder host.");
}

if (errors > 0) {
  console.error(`\n${errors} error(s), ${warnings} warning(s). Manifest validation failed.`);
  process.exit(1);
}
console.log(`✓ extension/manifest.json: 0 errors, ${warnings} warning(s).`);
