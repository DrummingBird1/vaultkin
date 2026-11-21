/**
 * Bundle the `sv` CLI (src/cli/sv.ts + the shared core) into one Node file.
 * Usage: pnpm build:cli → dist/cli/sv.cjs (run: node dist/cli/sv.cjs …)
 */
import { build } from "esbuild";

await build({
  entryPoints: ["src/cli/sv.ts"],
  outfile: "dist/cli/sv.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
  logLevel: "warning",
});
console.log("built dist/cli/sv.cjs");
