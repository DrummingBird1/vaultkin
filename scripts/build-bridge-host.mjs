/**
 * Build the browser-extension native-messaging host as a standalone binary
 * (Node single executable application), so the packaged app no longer needs
 * the RunAsNode fuse. Output: dist/bridge-host/vaultkin-bridge-host[.exe]
 *
 * Windows/Linux: wraps the Node binary running this script (CI builds on each
 * OS). macOS (or `--mac-universal` anywhere): downloads the official Node
 * darwin-x64 and darwin-arm64 builds of this Node version, checks them
 * against nodejs.org's SHASUMS256.txt, injects the host into each and merges
 * them with `lipo` into one universal binary, ad hoc signed (the release
 * signing step re-signs it with the real identity). Off a Mac, lipo/codesign
 * are skipped and the two per-arch binaries are left in dist/bridge-host/mac
 * for inspection.
 *
 * The SEA blob is architecture-independent (no snapshot, no code cache), so
 * one blob serves both architectures.
 */
import { build } from "esbuild";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { inject } from "postject";

const SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const NAME = "vaultkin-bridge-host";
const out = "dist/bridge-host";
const isMac = process.platform === "darwin";
const macUniversal = isMac || process.argv.includes("--mac-universal");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

await build({
  entryPoints: ["src/electron/bridge-host.ts"],
  outfile: `${out}/host.cjs`,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  legalComments: "none",
  logLevel: "warning",
});

const cfg = `${out}/sea-config.json`;
const blobPath = `${out}/sea-prep.blob`;
fs.writeFileSync(
  cfg,
  JSON.stringify({
    main: `${out}/host.cjs`,
    output: blobPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", cfg], { stdio: "inherit" });
const blob = fs.readFileSync(blobPath);

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

async function injectInto(exe, macho) {
  if (isMac && macho) run("codesign", ["--remove-signature", exe]);
  await inject(exe, "NODE_SEA_BLOB", blob, {
    sentinelFuse: SENTINEL,
    ...(macho ? { machoSegmentName: "NODE_SEA" } : {}),
  });
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Official Node binary for darwin-<arch>, verified against SHASUMS256.txt. */
async function officialMacNode(arch, sums, work) {
  const file = `node-${process.version}-darwin-${arch}.tar.gz`;
  const line = sums.split("\n").find((l) => l.trim().endsWith(`  ${file}`));
  if (!line) throw new Error(`${file} not listed in SHASUMS256.txt`);
  const expected = line.split(/\s+/)[0];
  const tgz = await download(`https://nodejs.org/dist/${process.version}/${file}`);
  const actual = createHash("sha256").update(tgz).digest("hex");
  if (actual !== expected) throw new Error(`${file}: SHA-256 mismatch`);
  const dir = path.join(work, arch);
  fs.mkdirSync(dir, { recursive: true });
  const tgzPath = path.join(dir, file);
  fs.writeFileSync(tgzPath, tgz);
  // Extract only bin/node (tar ships with macOS, Linux and Windows 10+).
  const member = `node-${process.version}-darwin-${arch}/bin/node`;
  // Relative paths + cwd: GNU tar reads "C:\..." as a remote host.
  execFileSync("tar", ["-xzf", file, member], { cwd: dir, stdio: "inherit" });
  return path.join(dir, member);
}

let result;
if (macUniversal) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vk-node-"));
  try {
    const sums = (
      await download(`https://nodejs.org/dist/${process.version}/SHASUMS256.txt`)
    ).toString();
    const macDir = path.join(out, "mac");
    fs.mkdirSync(macDir, { recursive: true });
    const parts = [];
    for (const arch of ["x64", "arm64"]) {
      const exe = path.join(macDir, `${NAME}-${arch}`);
      fs.copyFileSync(await officialMacNode(arch, sums, work), exe);
      fs.chmodSync(exe, 0o755);
      await injectInto(exe, true);
      parts.push(exe);
    }
    if (isMac) {
      result = path.join(out, NAME);
      run("lipo", ["-create", ...parts, "-output", result]);
      run("codesign", ["--sign", "-", "--force", result]);
      fs.rmSync(macDir, { recursive: true, force: true });
    } else {
      console.log("not on macOS: skipped lipo/codesign; per-arch binaries left in", macDir);
      result = macDir;
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
} else {
  result = path.join(out, `${NAME}${process.platform === "win32" ? ".exe" : ""}`);
  fs.copyFileSync(process.execPath, result);
  fs.chmodSync(result, 0o755);
  await injectInto(result, false);
}

for (const f of ["host.cjs", "sea-config.json", "sea-prep.blob"]) fs.rmSync(path.join(out, f));
console.log(`built ${result}`);
