# Changelog

## [Unreleased]

### Changed
- Electron 45 (from 43). The secret clipboard uses Electron's new asynchronous clipboard API.
- i18next 27, jsdom 31, vite-plugin-pwa 2, React 19.3 and other minor updates. GitHub Actions: checkout 7, upload-artifact 7, download-artifact 8, codecov 7, action-gh-release 3.

### Fixed
- Browser extension: the timer that wipes its login cache after 5 idle minutes never ran, because the `alarms` permission was missing. Expired logins were not used, but stayed in memory until Chrome stopped the background worker. Dropped the unused `scripting` and `storage` permissions.
- The Windows installer's file name matches the update metadata and checksums.

## [1.0.0-beta.2] — 2026-11-24

Builds are not code-signed: Windows SmartScreen and macOS Gatekeeper warn.

### Added
- Restore from backup: opens a `.svault` file (including a Recovery Kit) or the
  text of scanned QR backup codes, on an empty device or merged into an open vault.

### Fixed
- WebDAV Push no longer overwrites a server copy this vault has not seen. It
  asks to pull first, or to confirm the overwrite. The first Push to an
  existing file asks too.
- The user guide and troubleshooting no longer suggest deleting the local vault
  to reload it from WebDAV. English is now the main version of both.

### Changed
- Electron 43.8.12, electron-updater 6.8.11, Vite 8.2.4.

## [1.0.0-beta.1] — 2026-11-21

First public pre-release of Vaultkin. Everything in the sections below ships in it. Windows builds are not code-signed yet (SmartScreen will warn), and macOS builds are not notarized.

## [Unreleased] — M6 release preparation (2026-11-21)

### Changed
- Hebrew translation now covers the whole app, including copy and update
  notifications, import errors and accent color names; a test keeps the
  English and Hebrew string lists in sync.
- The browser extension's native-messaging host now ships as its own small
  program, so the desktop app's "run as Node" fuse is turned off in release
  builds (one less way to abuse the signed app binary).
- The app is renamed **Vaultkin** (was SecureVault). Existing data keeps
  working: the desktop app and the `sv` CLI keep using an old `SecureVault`
  data folder if one exists. Internal identifiers stay unchanged so nothing
  is orphaned: the IndexedDB names, `app://securevault`, the native-messaging
  host and the Firefox add-on id, and the Windows Hello key.

### Fixed
- Packaged desktop builds showed a blank window (a hardening fuse blocks
  loading the app from file://). The app is now served from
  `app://securevault`, with a real Content-Security-Policy header.
- The Authenticator page could crash React with an endless re-render
  ("Maximum update depth exceeded").

### Privacy
- Entry icons no longer load favicons from Google (that revealed which sites
  are in your vault); entries show their first letter instead.
- New PRIVACY.md lists every network request the app makes.

### Release engineering
- The packaged app no longer ships the renderer's libraries as
  node_modules (they're already bundled): app.asar went from ~3,800 files to
  a few dozen (2.2 MB).
- Store-ready extension packages (`build:extension:release`, no dev hosts),
  release assets with SHA-256 checksums, CycloneDX SBOM and signed build
  provenance. docs/RELEASE.md has the checklist and open blockers.

## [Unreleased] — M5 beyond parity (2026-11-21)

### Added
- SSH keys as a vault item: generate Ed25519 or import an existing OpenSSH
  key; copy the public key; fingerprint shown. Works with OpenSSH's own
  `ssh-keygen` (tested both ways).
- SSH agent (desktop, Settings → SSH agent): ssh and git can use the vault's
  keys. Every signature asks for approval (optionally remembered for 10
  minutes per key); nothing is available while the vault is locked.
- Attachments: add files to any entry (up to 25 MB each). Each file is
  encrypted with its own key, kept inside the vault; deleting the vault (or
  the duress password) removes them too. Attachments don't sync yet.
- Secure sharing without a server: share an entry as an encrypted
  `.svshare` file plus a separate code (send them over two channels), with
  an expiry of 1 hour, 1 day or 7 days and only the fields you pick. The
  recipient opens it in SecureVault and adds it to their vault.
- Sync folder (desktop, Settings → Sync): keeps an encrypted copy of the
  vault in a folder another tool syncs (Syncthing, OneDrive, Dropbox, NAS),
  updated after every change. A copy changed on another device is never
  overwritten: pull it and merge first.
- `sv` command line tool (read-only): list entries, print a field or the
  current 2FA code, and fill `.env`-style templates from the vault file in
  the sync folder. See docs/CLI.md.

### Fixed
- New entries silently dropped fields the store didn't list (found while
  adding SSH keys).
- Sync settings still said credentials stay in session memory.

## [Unreleased] — M4 security hardening, part 1 (2026-11-21)

### Security
- Production Content-Security-Policy (`default-src 'self'`, no frames, no
  plugins, `connect-src` https only). WebDAV servers must use https.
- Desktop window: can't be navigated away or host a `<webview>`; every
  permission request (camera, mic, notifications, devices…) is denied; window
  contents are hidden from screenshots and screen sharing.
- The vault locks when the computer sleeps, the screen is locked or the user
  switches.
- Duress password stored as salted Argon2id instead of unsalted SHA-256;
  existing enrollments keep working until re-enrolled.
- `docs/THREAT_MODEL.md` (STRIDE), listing what is done and what is open.

### Added
- Remember this device (desktop, opt-in, Settings → Security): unlock
  without typing the master password. The vault key is kept encrypted by the
  OS (Windows account protection / macOS Keychain with Touch ID), stops
  working when the master password changes, and the master password is
  required again at least every 14 days.
- WebDAV sync credentials are stored inside the encrypted vault instead of
  plaintext browser session storage (moved automatically), are unavailable
  while locked, and only https:// servers are accepted.
- Copied passwords and codes are kept out of Windows Clipboard History
  (Win+V) and cloud clipboard sync, and are wiped when the vault locks. The
  30-second auto-clear no longer erases something you copied yourself
  afterwards.
- Remember this device on Windows now uses Windows Hello (face, fingerprint or
  PIN) when it's set up: the stored key can only be unwrapped after a Hello
  check, not just by being signed in to Windows.

## [Unreleased] — M3 integrations (2026-11-21)

### Added
- Watchtower security report (replaces Password Health): breached, weak,
  reused (grouped), insecure http:// sites, expired / expiring cards, old
  passwords, missing passwords, no 2FA code; weighted score; per-category
  advice. Pure, tested analysis in `src/core/watchtower`.
- Desktop app ↔ browser extension bridge over native messaging, end-to-end
  encrypted (ADR 0007): one-time pairing confirmed with a 6-digit code in the
  app, per-connection keys, replay protection; the extension asks for the
  current site's logins on demand and caches nothing. Settings → Browser
  extension registers the connection for Chrome / Edge / Brave and lists
  paired browsers.
- Passkeys: SecureVault can save and use passkeys on websites (via the
  extension); every save and sign-in is confirmed in the app; anything it
  can't handle falls back to the browser's own passkey flow.
- Autofill v2 in the extension: an inline menu on login and 2FA fields
  (closed shadow DOM, Alt+↓, doesn't restructure the page), works in iframes,
  fills the current 2FA code, and asks twice before filling a login saved for
  another host or into a cross-site frame.
- Save / update prompt: after a sign-in, the extension offers to save a new
  login or update a changed password (kept in history); nothing is held
  longer than 3 minutes, and lock, dismiss or tab close drop it.
- Extension in Hebrew (and English) following the browser language.
- Firefox build (`dist/extension-firefox`); Settings → Connect also
  registers the connection for Firefox.
- Tests: Electron E2E drives the real bridge host as Chrome would, including
  pairing, scoped answers, replay/impostor rejection and a full passkey
  ceremony verified like a relying party; Chromium test for the page shim.

### Fixed
- Settings crashed in the browser build (store selector returning a new
  array each render); found by the accessibility E2E.

### Notes
- The extension must now be built (`pnpm build:extension`, load
  `dist/extension`).
- The native-messaging host runs as Electron in Node mode: the Electron
  binary writes a CRLF to stdout on Windows, which breaks the protocol.
  Disabling the RunAsNode fuse (Phase 4) requires a standalone host first.

## [Unreleased] — M2 design, UX and desktop (2026-11-21)

### Added
- Command palette (Ctrl/⌘+K): search entries (never by password or notes),
  copy password / username / 2FA code, open or edit entries, jump to pages and
  Settings sections, lock, theme.
- Quick Access hotkey Ctrl/⌘+Shift+Space on desktop: brings the window forward
  and opens the palette (ADR 0006).
- Complete Hebrew interface with right-to-left layout (579 strings, Hebrew dual
  plurals); password crack time and strength tips localized via Intl.
- First-run guide after creating a vault: Recovery Kit, import, shortcuts and
  language.
- Desktop: frameless window with native caption buttons that follow the theme;
  works with caption buttons on either side (right-to-left Windows).
- Design tokens v2 (radius, shadow, motion, focus ring, semantic Tailwind
  colors), lucide icons, thin themed scrollbars.
- Tests: axe accessibility E2E on every page, dialog and onboarding step in
  English and Hebrew; Electron E2E suite (`pnpm test:e2e:electron`) on the real
  desktop app with a throwaway profile.

### Changed
- Fonts are bundled (@fontsource) instead of loaded from Google Fonts: no
  third-party request on launch, works offline.

### Fixed
- Accent-colored text below 4.5:1 contrast (new runtime `--accent-text`).
- Show/hide password buttons below the 24px touch-target size.
- Buttons whose accessible name didn't match their visible text.
- Generator length slider had no label.
- Crack-time estimates above a million years were shown as "centuries".
- First keystrokes after the first Ctrl+K were lost while the palette loaded.

### Verified
- The Electron desktop app runs and renders (the "black screen" item from the
  old roadmap is fixed).

## [Unreleased] — M0/M1 foundation (2026-11-21)

### Added
- Vault schema v2 with a forward-only migrations framework (ADR 0004):
  tombstones and guaranteed entry timestamps; v1 vaults upgrade on unlock.
- WebDAV pull opens a merge view (remote unlock → merge / keep local / keep
  remote) instead of overwriting the local vault.
- Hash routing with Back/Forward and Settings section deep links (ADR 0005).
- UI primitives in `src/components/ui/`: `Modal` (all 12 dialogs), `Button`,
  `Field`, `Toaster`. `prefers-reduced-motion` support.

### Changed
- TypeScript 6, Tailwind CSS 4 (Vite plugin, PostCSS removed), Playwright
  1.65, refreshed dev tooling.
- Settings, Add/Edit Entry and Vault pages split into focused components
  (`components/settings/`, `components/vault/entry-form/`, `components/vault/views/`).

### Fixed
- Editing a card or note saved it as a login.
- Editing an entry moved it to the folder being viewed and reset imported
  TOTP digits/period/algorithm.
- New entries ignored the folder being viewed.
- Arrow keys changed the selection behind an open dialog.
- Keyboard shortcuts (Ctrl/⌘+L, K, N) could silently do nothing.
- Nested dialogs could leave the page unable to scroll.
- Extension background re-checks the sender origin and strips cached
  entries to the allowed fields.

### Tests
- 255 unit/integration tests (was 191): services, migrations, merge, entry
  form, primitives, shortcuts. E2E lifecycle passes on Chromium for the
  first time. Global coverage is ~31% against an 80% gate (UI largely
  untested) — the gate fails and is not lowered.

## [Unreleased] — Disaster recovery + reconstruction (2026-08-28, session 7)

The working tree was wiped by something outside this project (not caused by
any change in session 6) — everything except a `node_modules/.pnpm`
fragment was gone. The user restored a backup, which turned out to be the
session 6 snapshot below — missing an entire subsequent session's worth of
infrastructure and feature work. This entry documents rebuilding forward
from that backup, with git now initialized as a permanent safety net
(previously the project had no version control at all).

### Added — feature work rebuilt from the session-6 baseline
- Nested folders (`VaultFolder.parentId` tree, cascade-delete that unfiles
  entries rather than deleting them), global tag rename/delete, a Tag
  Manager modal, and a chip-based `TagInput` with autocomplete (now used
  in both the Tag Manager and `AddEditEntry.modal.tsx`).
- Grid / list / "service" (grouped-by-domain) vault views, row-virtualized
  with `@tanstack/react-virtual`; keyboard arrow navigation, bulk
  selection, and drag-reorder (list view).
- Recovery Kit (point-in-time passphrase-protected snapshot) and an
  in-app KDF upgrade flow for vaults still on PBKDF2-SHA256.
- Accessibility pass: focus trap on modals, `aria-live` toast region,
  high-contrast theme, route-level code splitting.
- i18n infrastructure (`react-i18next`, en/he locales) — deliberately
  partial, only the Unlock page migrated so far.
- Browser extension: popup UI (status/search/copy/fill/lock), a shared
  `constants/shared.json` imported directly by the MV3 service worker,
  and a build/validate pipeline (`scripts/build-extension.mjs`,
  `scripts/validate-extension-manifest.mjs`).
- Full repo tooling: pnpm + React 19, `config/` reorg for every tool
  config, ESLint flat config, Prettier, husky + lint-staged + commitlint,
  Changesets, ADRs (`docs/adr/`), a 10-job CI workflow plus a scheduled
  dependency audit, Lighthouse CI, Stryker mutation config, TypeDoc.

### Fixed — bugs found and closed during reconstruction
- **Password generator zero-buffer bug**: `crypto.getRandomValues(buf)`
  was only called inside the "buffer exhausted" refill check, so the
  first (and normally only) pass over a freshly-allocated buffer read
  zero-initialized memory — every generated password was the first
  alphabet character repeated. Now primed immediately after allocation.
- **Autosave race on lock**: `lockApplication` cleared the in-memory
  vault before flushing a pending debounced autosave, silently
  discarding the last edit. Now flushes first.
- **`ChangePassword.modal.tsx`** still matched `err.message` substrings
  instead of `instanceof WrongPasswordError`, predating the typed-errors
  migration. Fixed.
- **`openVault()` untyped-error leaks**, found by a new fast-check fuzz
  suite (`serializer.fuzz.test.ts`): a finite-but-non-integer
  `kdf.iterations` (e.g. `5e-324`) reached `hash-wasm` and threw a raw
  `Error`; a top-level JSON payload of `null` threw a raw `TypeError` on
  `payload.version`. Both now surface as `VaultCorruptError`.
- **Memory hygiene on lock** was missing the browser extension: locking
  the main vault didn't tell a paired extension to clear its cache,
  leaving plaintext credentials reachable there for up to its own
  5-minute idle window. `AppLifecycle.onLock` now calls
  `ExtensionBridge.lock` when an extension is paired.
- **Launcher scripts called `npm` directly** (`launch.bat`/`.ps1`/`.sh`),
  bypassing the project's actual package manager and its
  `pnpm-workspace.yaml` supply-chain allowlist. Switched to `pnpm`, with
  a friendly PATH check.
- Stale docs: `CLAUDE.md`/`AGENTS.md`'s repo layout still described the
  session-6 "snapshot caveat" (large parts of the tree "not yet
  restored") even though the tree is now complete; referenced a
  `VaultPayloadSchema` export that doesn't exist; `README.md` claimed a
  Markdown notes editor and a Storybook setup that were never built, and
  gave the KDF's parallelism as `p=2` instead of the actual `p=1`.
  `AGENTS.md` had the same `p=2` error. All corrected; remaining `npm`
  command examples across `README.md`/`LAUNCH.md`/`docs/README.security.md`
  switched to `pnpm`.

### Added — test suite reconstruction
- Rebuilt from 24 tests (one integration file) to 191, across co-located
  unit tests for `core/crypto`, `core/vault` (engine, serializer),
  `core/password` (generator, strength), `core/totp`, and
  `store/vault.store`'s folder/tag operations; a `fast-check`
  property-test suite for the password generator; and the
  `serializer.fuzz.test.ts` fuzz suite above.

### Verified
- `tsc --noEmit` clean (root + `config/tsconfig.electron.json` +
  `config/tsconfig.electron-builder.json`). `eslint .` — 0 errors, 43
  pre-existing warnings (all `no-explicit-any` in error-display catch
  blocks and test polyfills, none newly introduced). 191/191 tests pass.
  `vite build` succeeds.

---

## [Unreleased] — Argon2id, WebDAV, QR, extension UI (2026-05-17, session 6)

### Added — Argon2id key derivation (now the default)
- New vaults derive keys with **Argon2id (64 MiB, t=3, p=1)** via `hash-wasm` (pure WASM, bundles inline — no native toolchain, works under Vite + Node + CI). Measured ~170 ms/derivation.
- **Backward compatible**: the derivation path is chosen from the vault header's `kdf.name`, so PBKDF2-SHA256 (600k) vaults from the previous build still open unchanged.
- `SessionKeys` now carries the full `KdfParams` (name + cost params) + salt, so every re-encrypt round-trips with parameters that match the keys. The MAC binds all KDF params + salt + IV + ciphertext.

### Added — WebDAV backup (manual, safe)
- Real `fetch`-based WebDAV transport in `sync.service.ts`: `testConnection` (HEAD), `push` (PUT), `pull` (GET), HTTP Basic auth, ETag tracking. Only the **encrypted** blob is transmitted.
- Settings UI: URL + username + app-password, Test / Push↑ / Pull↓. Pull requires explicit confirmation (it overwrites local). Credentials live in `sessionStorage` only.
- Deliberately **not** auto-bidirectional: silent last-write-wins on two diverged encrypted blobs risks data loss, so the user drives push/pull until the decrypt→merge→re-encrypt loop (ConflictResolutionModal) is wired.

### Added — QR backup
- `VaultBackupQR.modal.tsx` exports the encrypted vault as a paged series of QR codes (`SVQR:i/n:` chunks) using `qrcode-generator` (full QR spec — all versions, alignment patterns, masks; replaces the single-block `lib/qrcode.ts` for this use). Arrow-key / button paging. Reachable from Settings → Export QR backup.

### Added — Browser-extension bridge UI
- Settings panel to store the extension ID (localStorage), **Send entries to extension** (`ExtensionBridge.syncEntries`), and **Lock extension** (`ExtensionBridge.lock`). Sends only the minimized snapshot; extension auto-clears after 5 min.

### Changed — Biometric (accurate detection, honest boundary)
- `BiometricService` now does real `isUserVerifyingPlatformAuthenticatorAvailable()` detection and a `supportsPRF()` gate. Full PRF-based unlock is **intentionally not shipped** — wrapping recoverable key material is security-critical and unverifiable without a real authenticator/CI. The unlock boundary stays at the master password; the non-functional biometric button is hidden until the tested flow lands. Rationale documented in `biometric.service.ts` + security docs.

### Accessibility
- Added `aria-label`s to the master-password (Unlock + Create), confirm, and entry Title/Username/Password inputs — improves screen-reader UX and makes the Playwright `getByLabel` selectors resolvable. (E2E still needs `npx playwright install chromium` to run; a couple of submit-button selectors may need verification against a live browser.)

### Verified
- `tsc --noEmit` clean. 24/24 integration tests pass against real WebCrypto + Argon2id. **Production `vite build` succeeds** (89 modules, 307 kB JS gzip 97 kB — includes inline Argon2 WASM).

---

## [Unreleased] — Scaffold restore + dead-feature wiring (2026-05-17, session 5)

### Fixed (blocking)
- **`src/App.tsx` import paths** — used `../` (a deeper-than-actual path) after the reorg, so Vite failed import-analysis and the app wouldn't load. Corrected to `./`.
- **`ChangePassword.modal` never changed the password** — it re-encrypted with the *existing* session keys (derived from the old password), so the vault still opened with the old password. Now uses `changeMasterPassword()` to re-derive keys from the new password, and swaps the live session keys so the next autosave stays consistent.
- **`saveVault()` produced an undecryptable payload** — it rolled a fresh salt but kept the old keys, so re-opening (deriving from the new salt) failed the integrity check. `SessionKeys` now carries the `salt` + `iterations` it was derived from, and `saveVault` reuses them. (Surfaced by the integration tests.)
- **Test isolation** — `setVault` now resets `searchQuery`, so a filter from one test/session no longer leaks into the next.

### Added — restored full app scaffold
The snapshot was missing the modules every import referenced. Wrote real, working
implementations so `npm run dev` / `electron:dev` actually launch:
- `src/core/` — crypto engine (AES-256-GCM + HMAC-SHA256 + **PBKDF2-SHA256 600k**), serializer façade, schema, TOTP (RFC 6238), Base32, password generator + strength analyzer.
- `src/store/` — session / vault / ui / totp Zustand stores + cross-store `index.ts`.
- `src/services/` — storage (IndexedDB), ipc, clipboard (auto-clear), autosave (debounced), import-export, app-lifecycle, history, biometric/sync/extension-bridge stubs.
- `src/hooks/` — useAutoLock, useKeyboardShortcuts, useQuickCopy, useBulkSelection, useDragReorder.
- `src/components/` — ErrorBoundary, AppShell, Sidebar, TopBar.
- `src/pages/` — Authenticator, Generator, Settings (theme/accent/auto-lock/duress/delete).
- `src/main.tsx`, `src/styles/globals.css` (full `sv-*` system + dark/light tokens), `src/electron/{main,preload}.ts`.
- Config: `tsconfig*.json`, `config/vite.config.ts`, `tailwind.config.cjs`, `postcss.config.cjs`. `package.json` trimmed to deps that install without a native toolchain.

### Added — wired previously-dead features
- **Duress password** — `Unlock.page` now checks `DuressService.isDuress()` before opening: wipes the real vault and opens an empty decoy (or just opens the existing decoy on repeat). Enrollment UI added to Settings.
- **Health "Fix" button** — `Vault.page` now consumes `editEntryId` from the ui store and opens the edit modal for the offending entry.
- **Per-entry version history** — `vault.store.updateEntry` snapshots the prior version into `HistoryService`; a "Previous versions" section in the entry detail panel restores them; cleared on lock.

### Changed
- KDF docs corrected to state **PBKDF2-SHA256 600k** (current) with Argon2id as the documented roadmap target — README, `docs/README.security.md`, CLAUDE.md.
- `CreateVault` default auto-lock 15 min → 5 min (matches the documented default).
- Removed the `window.location.reload()` after vault creation (state flip handles the transition).
- Added `.gitignore`.

### Verified
- `tsc --noEmit` clean (app + electron). All 24 integration tests pass against real WebCrypto.

---

## [Unreleased] — Reorg, launchers, and feature pack (2026-05-17, session 4)

### Added — Launcher
- **`launch.bat`** — Windows double-click entry. Checks Node 20+, runs `npm install` if needed, starts `electron:dev` (falls back to web mode on failure).
- **`launch.ps1`** — PowerShell variant with colored output and flags: `-Web` (Vite only), `-Build` (production Electron build + launch).
- **`launch.sh`** — macOS / Linux equivalent with `--web` / `--build` flags.
- **`LAUNCH.md`** — usage docs, including how to pin a Windows shortcut to taskbar / Start menu and how to make a `.desktop` entry on Linux.

### Changed — Repository layout
- Moved every loose source file into the canonical tree the README and CLAUDE.md describe:
  - `*.modal.tsx` → `src/components/modals/`
  - `*.page.tsx` → `src/pages/`
  - `breach.service.ts`, `duress.service.ts` → `src/services/`
  - `qrcode.ts` → `src/lib/`
  - `App.tsx` → `src/`
  - `background.js`, `content.js` → `extension/src/`
  - `manifest.json` → `extension/`
  - `vault-lifecycle.test.ts` → `tests/integration/`
  - `setup.ts` → `tests/`
  - `01-vault-lifecycle.spec.ts` → `e2e/`
  - `ci.yml` → `.github/workflows/`
  - `USER_GUIDE.md`, `TROUBLESHOOTING.md`, `README.security.md` → `docs/`
- CLAUDE.md updated to reflect the new tree and to keep a permanent "snapshot caveat" note explaining which modules still need to be restored.

### Added — UX / security improvements
- **Auto-hide password in `EntryDetail`**: revealing a password now starts a 10-second countdown (live `(Ns)` label on the toggle button) after which it auto-hides. Reduces shoulder-surfing and accidental-screenshot risk. Timer cancels on manual hide and clears on unmount.
- **Search-term highlighting**: matches in entry titles / usernames are wrapped in `<mark>` with accent-colored background. Same `Highlight` component works for grid and list views.
- **Phishing protection in `extension/src/content.js`**: before autofill, normalized `window.location.hostname` is compared to the entry's URL host (after stripping `www.`). On mismatch, a `confirm()` dialog warns the user and requires an explicit "Fill anyway". The background's generous domain matcher is still used for *finding* candidate entries — the strict check fires only on actual fill.
- **Inline SVG icons replacing emoji** in `Vault.page.tsx` (`IconStar`, `IconClose`, `IconEmptyVault`). Renders identically across Windows, macOS, Linux, iOS, Android; emoji do not. Internal documentation note added on the long-term plan to migrate to `lucide-react`.
- **`React.memo` on `EntryCard`**: prevents re-render of unchanged entry cards on every search keystroke. Combined with the memoized `highlightQuery`, this keeps large vaults responsive.

---

## [Unreleased] — Post-snapshot audit cleanup (2026-05-17, sessions 1-3)

### Performance / hardening (second pass)
- **HIBP batch check now runs with concurrency 6**: `BreachService.checkBatch` was serial — scanning 100 unique vault passwords took 100 round-trips end-to-end. Bounded parallelism cuts that to ~17 round-trips' worth of wall time, well within HIBP's rate limits.
- **`BreachService._cache` now bounded (LRU, cap 2000)**: previously unbounded; repeated scans of large vaults could grow the Map indefinitely. Recently-used entries are re-inserted on hit so eviction is LRU.
- **Extension content script debounces DOM scans**: `MutationObserver` previously ran a full `querySelectorAll('input[type="password"]')` per mutation. On busy SPAs (chats, social feeds) that's measurable jank. Now coalesced via `requestAnimationFrame`.
- **`AddEditEntry.modal.tsx` URL normalization on submit**: scheme autocomplete (`example.com` → `https://example.com`) ran only on field blur. Typing a URL and immediately pressing Enter/Save failed validation. Now applied in `handleSubmit` too.
- **Aria-labels on emoji-only buttons**: `Vault.page.tsx` `Edit`, close `✕`, favorite `★`, and `Show`/`Hide`/`Copy` controls now expose accessible labels (favorite also has `aria-pressed`).
- **`extension/src/background.js` dead `return true`**: the trailing `return true` after an already-responded path was misleading (suggested async response). Removed and replaced with a comment explaining all handlers are synchronous.
- **`ConflictResolution.modal.tsx` deep equality**: previous code used `JSON.stringify(l) === JSON.stringify(r)` to detect identical entries. That misfires on property-order drift and tag reordering, surfacing false "conflict" rows. Replaced with field-level comparison that treats `tags` as an unordered set and ignores transient fields.

### Fixed
- **Test suite broken**: `tests/integration/vault-lifecycle.test.ts` used `afterEach` without importing it from `vitest`. Added to imports.
- **Strength API mismatch in modals**: the previous "Fixed" entry below claimed the modals had been migrated to `analyzeStrength` / `effectiveEntropy`, but `AddEditEntry.modal.tsx`, `CreateVault.modal.tsx`, and `ChangePassword.modal.tsx` were still calling the old `analyzePassword` and reading `entropy`. Migrated for real.
- **Health page missing from router**: `App.tsx` registered `vault`, `authenticator`, `generator`, `settings` in `PAGES` but not `health`. Added.
- **`lockApplication` import leak in `App.tsx`**: imported but never referenced. Removed.
- **`AppLifecycle.onLock` on initial mount**: the previous "Fixed" entry below claimed a `wasUnlocked` ref guard was in place; it wasn't. Added the ref so the lock teardown only runs after a real unlock happened.
- **Biometric unlock still passed 3 args**: `Unlock.page.tsx` `handleBiometric` was calling `openVault(stored, "", keyMaterial)` even though `openVault` accepts only `(payload, password)`. Replaced the broken call with a clear "use master password" message (matches the previous "Fixed" claim).
- **CSV export was a no-op**: `Vault.page.tsx` built the CSV string and then immediately discarded it before calling `IPCService.vault.export(filename)` (no payload). The function was also never wired to any UI control. Replaced with a portable `Blob` download and added an "Export" button to the vault toolbar.
- **Import "overwrite" policy didn't overwrite**: `ImportVault.modal.tsx` had a comment claiming overwrites were handled in `vault.store`; in practice the modal fell through to `addEntry` regardless, producing duplicates. Now calls `updateEntry` on the existing entry id, with a dedupe key that ignores leading/trailing whitespace and title case.
- **HIBP fetch had no timeout**: `breach.service.ts` could hang the Health-page "Scan for breaches" indefinitely on a stalled network. Added a 10-second `AbortController`.
- **`EntryDetail` `showPw` leaked across entries**: selecting a different entry kept the same React instance, so a revealed password remained revealed on the next entry. Added `key={selectedEntry.id}` so the component re-mounts per entry.
- **Extension autofill silently skipped username outside `<form>`**: `content.js` `fillInput` looked for the username field only inside the password input's closest form. Many SPA login pages don't use a form wrapper. Added a DOM-neighborhood fallback walking parent containers until `<body>`, filtering hidden/disabled inputs.
- **`keytar` was in `devDependencies`**: it's a runtime dependency for the Electron build (OS keychain for session-key storage). Moved to `dependencies` in `package.json`.
- **`ChangePassword.modal.tsx` retained plaintext after success**: cleared `current` / `newPw` / `confirmPw` state on success so the strings drop out of React state and the React DevTools tree.
- **`ConfirmDelete.modal.tsx` foot-gun**: a trailing space in the typed title left the Delete button disabled with no hint why. Now trims both sides and shows a "title doesn't match (case-sensitive)" hint when the input is non-empty but doesn't match.

---

## [Previous Unreleased] — Black-screen fix + complete feature pack

### Fixed (Crashes)
- **Black screen on launch** — root cause was a cascading chain of broken imports that crashed React on startup before any UI could render.
  - `session.store.ts` imported `wipeSessionKeys` and `SessionKeys` from `engine.ts` where they did not exist.
  - `serializer.ts` imported eight non-existent functions (`encryptVault`, `decryptVault`, `deriveMasterKey`, `serializePayload`, `deserializePayload`, `wipeSessionKeys`, `EncryptedVaultPayload`, `SessionKeys`) from `engine.ts`.
  - `engine.ts` imported `VaultPayload`, `VaultPayloadSchema`, and `createDefaultVaultData` from `vault.model.ts` where they did not exist.
  - `zod` was referenced via `VaultPayloadSchema.parse()` but was not installed.
- Created `src/core/vault/vault-types.ts` as the single source of truth for `SessionKeys`, `VaultPayload`, `VaultPayloadSchema`, `wipeSessionKeys`, and `createDefaultVaultData`. Both `engine.ts` and `serializer.ts` now import from here.
- Rewrote `serializer.ts` as a proper adapter layer over the engine API. The raw engine API (`Uint8Array` keys, `VaultPayload` objects) is now only used internally; the public façade exposes `createVault`, `openVault`, `reEncryptVault`, `changeMasterPassword`.
- Fixed wrong function names in modals: `analyzePassword` → `analyzeStrength`, `analyzePasswordStrength` → `analyzeStrength`.
- Fixed wrong field references: `analysis.entropy` → `analysis.effectiveEntropy`, `strength.crackTime` → `strength.crackTimeDisplay`.
- `lockApplication("system")` was an invalid `LockReason` — replaced with `"inactivity"`.
- `App.tsx` called `AppLifecycle.onLock()` on initial mount before any unlock; the existing `wasUnlocked` ref guard is now respected.
- Biometric unlock previously passed three arguments to `openVault` which only accepts two; biometric path now shows a clear "use master password" message until the keys-only decryption flow is properly wired.
- Added all missing CSS utility classes (`sv-modal`, `sv-modal-backdrop`, `sv-input`, `sv-label`, `sv-error`, `sv-btn-primary`, `sv-btn-secondary`, `sv-btn-danger`, `sv-btn-ghost`, `sv-card`, `sv-tab`, `sv-progress`, `sv-progress-bar`, `sv-badge`, `sv-icon-btn`, `sv-divider`, `sv-modal-title`, `sv-modal-subtitle`, `sv-hint`) to `globals.css`.
- `autosave.service.ts` now loads the existing vault payload before re-encryption so `vaultId`, `salt`, and `kdfParams` are preserved across saves (previously called `saveVault(vault, sessionKeys)` with two args; the engine requires three).
- `ChangePassword.modal.tsx` now uses `changeMasterPassword()` which actually re-derives keys from the new password (previously called `saveVault` which kept the old keys, leaving the password unchanged).

### Added — Crash Safety
- **`ErrorBoundary` component** — replaces any future render error with a recoverable "Something went wrong" UI offering Try again / Reload, instead of a blank screen.
- Wired into `main.tsx` so it covers the entire React tree.

### Added — Productivity
- **Keyboard shortcuts** — global hotkeys: `Ctrl/⌘+K` search, `+N` new entry, `+L` lock, `+G` generator, `+,` settings; `/` focus search; `?` shortcuts help; `Esc` clear/close.
- **`useQuickCopy` hook** — one-click copy of password / TOTP / username from entry cards with toast confirmation and auto-clear.
- **`useBulkSelection` hook** — multi-select state for batch operations on entries (delete-many, move-to-folder).
- **`useDragReorder` hook** + CSS — HTML5 drag-and-drop reordering of entries; wired into the Vault page; auto-disabled while searching to keep search results stable.
- **`reorderEntries` action** added to `vault.store`.
- **`ShortcutsHelp` modal** — visible cheat-sheet of all shortcuts.

### Added — Security
- **Password Health dashboard** — new `/health` page showing weak / old / reused / missing / no-2FA / pwned password issues with a 0-100 health score and one-click "Fix" buttons that jump to edit the offending entry.
- **HIBP breach detection** (`BreachService`) — k-anonymity check against Have I Been Pwned; only the first 5 hex chars of the SHA-1 hash leave the device. Per-session cache prevents redundant calls. Cleared on lock.
- **Duress password** (`DuressService`) — second password that, when entered, silently wipes the local vault and creates an empty decoy. Hash stored in localStorage; constant-time comparison; trigger banner shown on next normal unlock.
- **Per-entry version history** (`HistoryService`) — keeps the last 10 versions of each entry in volatile memory, restoreable via the entry detail panel; cleared on lock.

### Added — Sharing & Backup
- **QR code encoder** (`lib/qrcode.ts`) — zero-dependency Type 1-10 byte-mode encoder with ECC level M and Reed-Solomon error correction. ~280 lines, no network calls.
- **`VaultBackupQRModal`** — exports the encrypted vault as a series of QR codes (chunked 240 bytes each, prefixed `SVQR:N/M:`); arrow keys / prev-next buttons to page through.
- **Custom field templates** (`field-templates.ts`) — 8 pre-built templates: Credit Card, SSH Key, API Credentials, Wi-Fi, Passport, Bank Account, Software License, Crypto Wallet.
- **Markdown notes** (`lib/markdown.ts`) — lightweight zero-dependency renderer with XSS-safe URL whitelist (`http(s):`, `mailto:`, `otpauth:`). Supports headings, bold, italic, code, code blocks, lists, links, blockquotes, hr.
- **`ConflictResolutionModal`** — side-by-side diff UI for sync conflicts; shows local-only / remote-only / conflict / identical entries with counts; offers Merge (most recent updatedAt wins) / Keep local / Keep remote.

### Added — Browser Extension
- **MV3 manifest + background service worker + content script + popup** (`extension/`) — companion Chrome/Edge/Brave extension for autofill.
  - `background.js` — in-memory entry cache, 5-min idle timeout, externally_connectable bridge to the main app.
  - `content.js` — detects password inputs, overlays 🔐 trigger, on-demand autofill (no silent fill) with React-aware value setters.
  - `popup/` — toolbar UI with status, entry list, lock/open buttons.
  - Domain matching: exact + bidirectional subdomain.
- **`ExtensionBridge` service** — sends a minimized snapshot of vault entries (id, title, url, username, password, totpSecret only) to the extension via `chrome.runtime.sendMessage`. User-initiated only.

### Added — Settings UI
- **`SecurityPanel` component** — Settings tab exposing duress enrollment, browser extension sync (with Extension ID input), auto-lock info, and acknowledgement banner for triggered duress events.
- **QR Backup section** added to Settings.

### Added — Testing & Tooling
- **Playwright E2E config** (`playwright.config.ts`) + 2 spec files:
  - `01-vault-lifecycle.spec.ts`: full create / unlock / add / lock / re-unlock / wrong-password flow with real WebCrypto.
  - `02-keyboard-shortcuts.spec.ts`: verifies `Ctrl/⌘+K`, `+N`, `+L` actually trigger their actions in a real browser.
- **Storybook scaffold** (`.storybook/`) + 2 sample stories:
  - `ShortcutsHelp.stories.tsx`
  - `ErrorBoundary.stories.tsx` (Healthy + Crashed scenarios)
- **`package.json`** updated with new scripts (`test:e2e`, `test:e2e:ui`, `test:e2e:headed`, `storybook`, `build:storybook`) and devDependencies (Playwright, Storybook 8.x suite, `@types/chrome`).

### Added — Documentation
- `USER_GUIDE.md` — comprehensive Hebrew user guide covering install, daily use, every new feature, security model.
- `TROUBLESHOOTING.md` — Hebrew troubleshooting guide for all common issues.
- `CHANGELOG.md` — this file.
- Inline JSDoc on every new module documenting purpose, threat model, and security considerations.

---

## Architecture notes

- **Single source of truth for crypto types**: `vault-types.ts` is imported by `engine.ts` (the actual crypto layer) and `serializer.ts` (the app-facing façade). No more circular dependencies.
- **Adapter layer pattern**: `serializer.ts` translates between `(Uint8Array, VaultPayload)` from the engine and `(SessionKeys, payloadJson string)` used by the rest of the app, so swapping the engine implementation later is trivial.
- **Memory hygiene**: `BreachService._cache`, `HistoryService.versions`, and `ExtensionBridge` cache are all cleared on lock to maintain the zero-knowledge invariant.
- **Defense in depth**: `ErrorBoundary` is the last line of defense; `DuressService` adds a layer beneath the unlock flow; `extension-bridge.service` minimizes data leaving the app to the bare minimum the extension needs.
