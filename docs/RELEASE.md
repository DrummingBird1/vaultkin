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

- **Code signing.** Decided: builds ship unsigned (see
  [CODE_SIGNING_POLICY.md](../CODE_SIGNING_POLICY.md)).
- **macOS.** The universal extension host starts on the macOS CI runner (release
  job). Pairing with a browser on a Mac has not been tested.
- **External security audit** before 1.0 (see `docs/THREAT_MODEL.md`).

## Decisions only the owner can make

- **License.** Decided: GPL-3.0-only (`LICENSE`).
- **Name and brand.** Check that "Vaultkin" can be used: trademarks, store
  listings, domain. The logo is `assets/logo.svg` (a vault door with a V);
  `node scripts/generate-icons.cjs` renders every PNG from it. Store
  screenshots are still to do.
- **Store accounts.** Set up the Web Store, Edge Add-ons and AMO developer
  accounts.
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
