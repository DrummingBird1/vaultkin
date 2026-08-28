#!/usr/bin/env node
/**
 * Lockfile / supply-chain sanity check for pnpm-lock.yaml.
 *
 * The `lockfile-lint` npm package advertises pnpm support but its parser
 * only actually understands package-lock.json and yarn.lock (confirmed by
 * running it against this repo's lockfile — it throws "Unable to find
 * relevant lockfile parser for type pnpm"). Rather than depend on a tool
 * that silently doesn't do what it claims, this is a small hand-rolled
 * check for the two things that actually matter here:
 *
 *   1. No .npmrc is redirecting installs to a registry other than the
 *      official npm one (registry confusion / dependency-hijack vector).
 *   2. No lockfile entry resolves a package from a tarball host other than
 *      registry.npmjs.org (a package could otherwise be swapped out from
 *      under the pinned version+integrity hash).
 *
 * Every plain registry dependency in pnpm-lock.yaml carries a subresource-
 * integrity hash already, so this focuses on the "where did it come from"
 * question, not "was it tampered with in transit" (pnpm/npm already do that).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_HOST = "registry.npmjs.org";
let failed = false;

function fail(message) {
  console.error(`✖ ${message}`);
  failed = true;
}

// 1. .npmrc registry override
const npmrcPath = path.join(root, ".npmrc");
if (existsSync(npmrcPath)) {
  const npmrc = readFileSync(npmrcPath, "utf8");
  const registryLine = npmrc.split("\n").find((l) => /^\s*registry\s*=/.test(l));
  if (registryLine && !registryLine.includes(ALLOWED_HOST)) {
    fail(`.npmrc sets a non-default registry: ${registryLine.trim()}`);
  }
}

// 2. Lockfile tarball hosts
const lockfilePath = path.join(root, "pnpm-lock.yaml");
const lockfile = readFileSync(lockfilePath, "utf8");
const tarballMatches = [...lockfile.matchAll(/tarball:\s*(\S+)/g)];
for (const [, url] of tarballMatches) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    // Relative/local reference (workspace link) — not a remote fetch, skip.
    continue;
  }
  if (host !== ALLOWED_HOST) {
    fail(`Lockfile resolves a package from an untrusted host: ${url}`);
  }
}

if (failed) {
  console.error("\nLockfile policy check failed.");
  process.exit(1);
}
console.log(
  `✓ pnpm-lock.yaml: all ${tarballMatches.length} tarball reference(s) point to ${ALLOWED_HOST}; no rogue .npmrc registry override.`,
);
