/**
 * Build the browser-extension native-messaging host as a standalone binary
 * (Node single executable application), so the packaged app no longer needs
 * the RunAsNode fuse. Output: dist/bridge-host/vaultkin-bridge-host[.exe]
 *
 * Builds for the current OS/arch only (CI runs it on each OS). Node's own
 * binary is the base; the macOS build is re-signed ad hoc after injection
 * (the release signing step signs it properly).
 */
import { build } from "esbuild";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { inject } from "postject";

const out = "dist/bridge-host";
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
fs.writeFileSync(
  cfg,
  JSON.stringify({
    main: `${out}/host.cjs`,
    output: `${out}/sea-prep.blob`,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", cfg], { stdio: "inherit" });

const exe = path.join(out, `vaultkin-bridge-host${process.platform === "win32" ? ".exe" : ""}`);
fs.copyFileSync(process.execPath, exe);
fs.chmodSync(exe, 0o755);
if (process.platform === "darwin")
  execFileSync("codesign", ["--remove-signature", exe], { stdio: "inherit" });

await inject(exe, "NODE_SEA_BLOB", fs.readFileSync(`${out}/sea-prep.blob`), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ...(process.platform === "darwin" ? { machoSegmentName: "NODE_SEA" } : {}),
});

if (process.platform === "darwin")
  execFileSync("codesign", ["--sign", "-", exe], { stdio: "inherit" });

for (const f of ["host.cjs", "sea-config.json", "sea-prep.blob"]) fs.rmSync(path.join(out, f));
console.log(`built ${exe}`);
