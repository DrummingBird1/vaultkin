# Releasing Vaultkin

## How a release is built

1. Bump `version` in `package.json` (Changesets: `pnpm changeset version`) and
   update `CHANGELOG.md`.
2. Tag `vX.Y.Z` and push the tag. `.github/workflows/ci.yml` then:
   - **Checks.** Runs typecheck, lint and tests.
   - **Installers.** Builds them per OS (`electron:dist:* --publish never`):
     - Windows NSIS;
     - macOS universal DMG;
     - Linux AppImage, deb and rpm.
   - **Extras.** Builds the store packages (`build:extension:release`, with
     no dev hosts; Chrome zip and Firefox zip) and the `sv` CLI.
   - **Draft release.** Creates a **draft** GitHub Release with:
     - every file;
     - `SHA256SUMS.txt`;
     - the CycloneDX SBOM (`sbom.json`);
     - signed build provenance (`gh attestation verify <file> --repo <owner>/<repo>`).
3. Review the draft, then publish it.

## Packaged-build smoke test (do this before every release)

`pnpm electron:build && pnpm exec electron-builder --dir --win -c.publish=null`,
then run `release/win-unpacked/Vaultkin.exe` and check:

- [ ] **Window.** The window shows the unlock or create screen, not a blank
      window. The renderer is served from `app://securevault`, and stderr shows
      no `Failed to load URL`.
- [ ] **Create and reopen.** Create a vault, add an entry, lock, unlock. This
      runs Argon2 (WebAssembly) under the production CSP.
- [ ] **Browser extension.** Settings → Browser extension → Set up, then
      Connect from the extension. Pair and fill a login. The registered host
      must be `resources/bridge-host/vaultkin-bridge-host(.exe)`, and
      `electron-fuses read` must show RunAsNode Disabled.
- [ ] **Remember this device.** Windows Hello prompt appears, and the vault
      unlocks with it.
- [ ] **SSH agent.** `ssh-add -L` with `SSH_AUTH_SOCK` set lists the key.

## Release blockers (open)

- **macOS universal host is untested on a Mac.** `build:bridge-host` on
  macOS downloads the official Node x64 and arm64 builds (SHA-256 checked
  against nodejs.org), injects the host into each and merges them with
  `lipo`. Off a Mac everything up to `lipo` has been run (both Mach-O files
  carry the host); `lipo`, `codesign` and running it are checked by the
  macOS CI job, which has not run yet. Signed with hardened runtime, the host
  needs the JIT entitlements Electron's default entitlements already grant.
- **Code signing.** Decided: Windows first, with Azure Trusted Signing;
  macOS waits until there is demand (Apple Developer, $99/year), so
  Gatekeeper warns until then. Owner steps for Windows:
  1. Create an Azure Trusted Signing account and certificate profile
     (identity validation takes a few days).
  2. Add the repo secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
     `AZURE_CLIENT_SECRET`, and set `win.azureSignOptions` (endpoint,
     account, profile) in `electron-builder.ts`.
  3. Sign `resources/bridge-host/vaultkin-bridge-host.exe` too: it's a Node
     binary with the host injected, so Node's original signature is no
     longer valid.
- **CI has never run on GitHub.** Decided: the repo goes public at
  `github.com/DrummingBird1/vaultkin` (`publish` already points there),
  where Actions minutes are free, macOS included. Not pushed yet.
- **Browser tests run only in Chromium locally.** Install the others with
  `pnpm exec playwright install firefox webkit`, then run the full matrix once.
- **External security audit** before 1.0 (see `docs/THREAT_MODEL.md`).

## Decisions only the owner can make

- **License.** Decided: GPL-3.0-only (`LICENSE`).
- **Name and brand.** Check that "Vaultkin" can be used: trademarks, store
  listings, domain. The logo is `assets/logo.svg` (a vault door with a V);
  `node scripts/generate-icons.cjs` renders every PNG from it. Store
  screenshots are still to do.
- **Public repository.** Make the repo public, enable Private Vulnerability
  Reporting (SECURITY.md), and set up the Web Store, Edge Add-ons and AMO
  developer accounts.
- **Web build host.** If the PWA will be hosted, decide where. The production
  CSP and the extension then need that origin.

## Store submission notes

- **Chrome Web Store / Edge Add-ons.** Upload
  `Vaultkin-extension-chrome-<tag>.zip`.
  - Permissions to justify: `<all_urls>` (autofill on any site),
    `nativeMessaging` (desktop app), `scripting`, `storage`, `clipboardWrite`.
  - Privacy: link `PRIVACY.md`.
- **Firefox AMO.** Upload `Vaultkin-extension-firefox-<tag>.zip`.
  - Add-on id: `securevault@securevault.app`. It must stay fixed, because
    native messaging allows the add-on by this id.
  - AMO asks for the source code: link the repo and give
    `pnpm build:extension:release` as the build command.
