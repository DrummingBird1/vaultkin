/**
 * @file electron-builder.ts
 * Packaging config for the desktop distributables. Invoked via the
 * `electron:dist*` scripts in package.json (and by `.github/workflows/ci.yml`'s
 * release job on `v*.*.*` tag pushes).
 *
 * NOTE: the filename matters — electron-builder auto-discovers a config file
 * literally named `electron-builder.{yml,json,json5,toml,js,cjs,ts}` in the
 * project root (see `findAndReadConfig` in its `util/config/load` module). A
 * `.config.ts` suffix (a common convention for other tools) is NOT in that
 * search list and would silently be ignored, falling back to defaults whose
 * `directories.output` ("dist") collides with this project's own Vite/tsc
 * build output — don't rename this without re-testing `electron:dist:*`.
 *
 * `files`/`directories.output` assume `pnpm run electron:build` already ran
 * (compiles the renderer to dist/renderer and the main process to
 * dist/electron — see those scripts). This config only packages what's
 * already built; it doesn't build anything itself.
 *
 * Type-checked under config/tsconfig.electron-builder.json, NOT the root
 * tsconfig.json — see that file's header comment for why (a self-import
 * collision caused by baseUrl + this file's mandatory name/location).
 */
import type { Configuration } from "electron-builder";
import type { AfterPackContext } from "electron-builder";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";
import * as path from "path";

/**
 * Hardens the packaged Electron binary with build-time fuses (a feature of
 * the `electron` npm package itself, applied via @electron/fuses) — this is
 * additive to, not a replacement for, the runtime sandbox flags already set
 * in src/electron/main.ts's BrowserWindow (contextIsolation/sandbox/
 * nodeIntegration: false). Fuses close off attack surface that exists
 * *before* any of that renderer-level config even runs:
 *   - runAsNode: without this off, `ELECTRON_RUN_AS_NODE=1 ./Vaultkin ...`
 *     turns the packaged binary into a generic Node interpreter — a
 *     well-known Electron abuse vector for LOLBIN-style attacks.
 *   - nodeCliInspectArguments / nodeOptionsEnvironmentVariable: without
 *     these off, `--inspect`/`--inspect-brk` or the NODE_OPTIONS env var
 *     could attach a debugger or inject a --require'd script into the
 *     running app — a path to reading master-password-derived key material
 *     out of memory.
 *   - onlyLoadAppFromAsar: stops app code from being loaded from an
 *     unpacked-and-tampered copy sitting next to the real app.asar.
 */
async function hardenElectronFuses(context: AfterPackContext): Promise<void> {
  const { appOutDir, packager, electronPlatformName } = context;
  const productName = packager.appInfo.productFilename;

  const electronBinaryPath =
    electronPlatformName === "darwin"
      ? path.join(appOutDir, `${productName}.app`, "Contents", "MacOS", productName)
      : electronPlatformName === "win32"
        ? path.join(appOutDir, `${productName}.exe`)
        : path.join(appOutDir, productName);

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    // Off: the browser-extension native-messaging host ships as its own
    // binary (resources/bridge-host, built by scripts/build-bridge-host.mjs),
    // so nothing needs to run this app binary as plain Node.
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
}

const config: Configuration = {
  appId: "com.vaultkin.app",
  productName: "Vaultkin",
  copyright: "Copyright (c) Vaultkin contributors",

  directories: {
    output: "release",
    buildResources: "build",
  },

  // package.json's own "main" (dist/electron/main.js) is reused as-is —
  // no extraMetadata override needed.
  // Standalone native-messaging host (built per OS by build:bridge-host).
  extraResources: [{ from: "dist/bridge-host", to: "bridge-host" }],
  files: [
    "dist/electron/**/*",
    "!dist/electron/**/*.test.js",
    "dist/renderer/**/*",
    "package.json",
    "!**/*.map",
  ],

  // A single square build/icon.png (>=256px, ideally 1024px — see
  // scripts/generate-icons.cjs) is enough; electron-builder auto-generates
  // the per-platform .icns/.ico from it.
  mac: {
    category: "public.app-category.utilities",
    target: [{ target: "dmg", arch: ["universal"] }],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    // No notarization/codesign identity configured — see CLAUDE.md known
    // gotchas. CI sets CSC_IDENTITY_AUTO_DISCOVERY=false so unsigned builds
    // still produce a usable (Gatekeeper-warns-on-open) .dmg.
  },

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
  },

  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
      { target: "rpm", arch: ["x64"] },
    ],
    category: "Utility",
  },

  afterPack: hardenElectronFuses,

  // Points electron-updater at this repo's GitHub Releases so the manual
  // "Check for updates" button in Settings (src/electron/update.service.ts)
  // has somewhere to check against. publish: null previously disabled this
  // entirely; "always" here does NOT mean auto-update — electron-updater
  // only checks/downloads when explicitly told to (see update.service.ts's
  // header comment for why auto-polling is deliberately not wired in).
  publish: {
    provider: "github",
    owner: "vaultkin",
    repo: "vaultkin",
  },
};

export default config;
