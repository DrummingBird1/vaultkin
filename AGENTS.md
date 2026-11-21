# AGENTS.md

This file gives AI coding agents (Codex, Claude Code, Copilot, Cursor, Gemini and others) essential context for working in this repo. Keep it short and durable; link out to canonical docs instead of duplicating them.

<!-- BEGIN core-rules v1 (generated from the shared core-rules.md; do not edit by hand) -->
## Core rules (apply to every agent)

- Read this file first. If `HANDOFF.local.md` exists next to it, read it too (local only, not in git).
- Never push, force-push or create remotes unless the owner explicitly asks. Work on a branch named `agent/<tool>-<topic>`; merge to `main` only through a pull request.
- Never commit or print secrets (`.env`, keys, tokens). Keep personal paths, emails and private repo names out of tracked files.
- Package managers: JavaScript uses `pnpm`, Python uses `uv`. Do not switch without being asked.
- Dev servers listen on `127.0.0.1` only, unless the owner asks otherwise.
- Do not delete or overwrite user data. Move it to an archive folder or ask first, and do a dry run before bulk changes.
- Make the smallest change that solves the task. Run this project's own check and test commands (see Run and Test in this file) and say what you ran and what you could not verify.
- If you have no access to the repository (a chat-only agent), return a unified diff or complete files, and list what the owner should verify.
<!-- END core-rules -->

## What this is

**Vaultkin** — a zero-knowledge password manager + 2FA authenticator. React + TypeScript + Vite + Electron, with a companion Chrome MV3 browser extension for autofill.

- Master password never leaves the device.
- AES-256-GCM encryption, HMAC-SHA256 (Encrypt-then-MAC). KDF is **Argon2id (64 MiB, t=3, p=1)** via `hash-wasm`; PBKDF2-SHA256 600k vaults still open (KDF chosen from the vault header). Defaults live in `DEFAULT_KDF` in `src/core/vault/engine.ts` — see [docs/README.security.md](docs/README.security.md).
- RFC 6238 TOTP, HIBP k-anonymity breach check, duress password, WebDAV E2E sync.
- See [README.md](README.md), [docs/README.security.md](docs/README.security.md), [CHANGELOG.md](CHANGELOG.md) for the full picture.

## Running locally

```bash
pnpm install
pnpm dev                  # Vite at http://localhost:5173
pnpm electron:dev         # Electron + Vite (HMR)
```

Or just double-click [`launch.bat`](launch.bat) (Windows). See [LAUNCH.md](LAUNCH.md) for cross-platform launchers and shortcut creation.

## Repo layout

```
securevault/
├── launch.{bat,ps1,sh}                       # one-click launchers
├── LAUNCH.md                                 # launcher usage / shortcut tips
├── index.html
├── package.json
├── electron-builder.ts                       # electron-builder config (must live at root — its own config discovery requires this)
├── pnpm-workspace.yaml                       # allowBuilds allowlist; packages: ["."] so Changesets sees a versionable package
├── config/                                   # vite/vitest/playwright/tailwind/postcss/tsconfig/lighthouse configs
├── src/
│   ├── App.tsx
│   ├── core/                                 # crypto engine, vault serializer, password/TOTP logic — no React/DOM deps
│   ├── store/                                # Zustand stores (session, vault, ui, totp) + store/index.ts lifecycle glue
│   ├── services/                             # storage, sync, duress, biometric, extension-bridge, breach, ...
│   ├── components/{modals,vault,layout}/     # *.modal.tsx, vault views (grid/list/service), app shell
│   ├── hooks/
│   ├── pages/                                # *.page.tsx — Vault, Unlock, Authenticator, Generator, Health, Settings
│   ├── cli/                                  # `sv` CLI (read-only, bundled by scripts/build-cli.mjs → dist/cli/sv.cjs)
│   ├── i18n/                                 # react-i18next setup, en/he locales (partial migration — see gotchas)
│   ├── electron/                             # main process, preload, updater
│   └── styles/globals.css                    # sv-* design-system layer
├── extension/                                # MV3 browser extension (background/content/popup)
├── tests/{setup.ts,integration/}             # Vitest polyfills + integration suite
├── e2e/                                      # Playwright
├── docs/{USER_GUIDE,TROUBLESHOOTING,README.security}.md   # Hebrew user docs + security doc
├── docs/adr/                                 # architecture decision records
└── .github/workflows/{ci,scheduled-audit}.yml
```

## Architectural invariants (do not violate)

Load-bearing for the zero-knowledge model. Breaking them is a security regression, not a refactor.

1. **Master password never leaves the device.** No telemetry, no error reports include vault content. The HIBP check sends 5 hex chars of a SHA-1 hash, nothing more.
2. **Crypto types in one place** — `src/core/vault/vault-types.ts` is the single source of truth for `KdfParams`, `SessionKeys`, `VaultPayload`, `wipeSessionKeys`, `createDefaultVaultData`. Both `engine.ts` and `serializer.ts` import from there.
3. **`serializer.ts` is the public façade.** Outside `core/`, code calls `createVault` / `openVault` / `reEncryptVault` / `changeMasterPassword` from `serializer.ts`. It does not poke at the engine's raw `Uint8Array` key API.
4. **Memory hygiene on lock.** `BreachService._cache`, `HistoryService.versions`, SSH-agent approvals (`SshAgentService.onLock`), the clipboard (`ClipboardService.clearNow`), and the paired browser extension's cache (via `ExtensionBridge.lock`) **must** be cleared in `AppLifecycle.onLock`. Adding a new in-memory cache holding plaintext-derived data? Wire it into lock teardown.
5. **`ErrorBoundary` wraps the whole tree.** Crashes must not leak a blank screen.
6. **Password strength API.** Exported function is `analyzeStrength(...)`, entropy field is `effectiveEntropy`. `analyzePassword` is kept only as a documented backward-compat alias — don't add new callers of it, and don't reintroduce `.entropy`-only callers.
7. **`lockApplication` reasons.** Valid `LockReason`: `"manual"`, `"inactivity"`, `"duress"`. Not `"system"`.
8. **Electron sandbox.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP `default-src 'self'` (injected at build by `sv-csp` in `config/vite.config.ts`), navigation/webview blocked, all permission requests denied, content protection on. Don't loosen.
9. **Browser extension data minimization.** `ExtensionBridge` sends only `{id, title, url, username, password, totpSecret}`. Cache auto-wipes after 5 min idle. Autofill enforces strict domain match; generous match is only used for "what entries belong to this site".
10. **Duress password.** Stored as a salted Argon2id hash (`argon2id$<salt>$<hex>`) in `localStorage` under `sv_duress_hash`; legacy unsalted SHA-256 is only read, never written. Constant-time comparison.
11. **Password generator RNG buffer.** `crypto.getRandomValues(buf)` must be called immediately after allocating the buffer in `generatePassword`/`randomWordIndices`, not only inside the "buffer exhausted" refill check — see the comment in `src/core/password/generator.ts` for the exact regression this guards against.
12. **Autosave flush before lock clears state.** `lockApplication` must call `AutosaveService.flushNow()` before `setVault(null)` — a pending debounced edit would otherwise be silently discarded.

## Code style notes

- TypeScript strict; React functional components + Zustand stores.
- Tailwind utility classes plus an `sv-*` design-system layer (`sv-modal`, `sv-input`, `sv-btn-primary`, `sv-card`, ...) defined in `src/styles/globals.css`.
- Path aliases (vitest + vite): `@core`, `@services`, `@store`, `@components`, `@hooks`, `@pages`.
- Prefer existing `sv-*` primitives over rolling new ones.
- Icons are inline SVG components in [src/components/icons.tsx](src/components/icons.tsx) — prefer these over emoji (emoji renders differently per OS). Long-term plan: `lucide-react`.
- Typed errors (`src/core/errors.ts`: `WrongPasswordError`, `VaultCorruptError`, `DuressTriggeredError`) are caught with `instanceof`, never by matching `err.message` substrings.

## Testing (Run and Test)

- Commands (script names taken from `package.json`; not executed in the 2026-11-15 normalization, so not verified / לא אומת): `pnpm test` (Vitest), `pnpm test:coverage`, `pnpm test:e2e` (Playwright), `pnpm lint`, `pnpm typecheck`, `pnpm format:check`.
- **Vitest** (`config/vitest.config.ts`) with jsdom; polyfills in [tests/setup.ts](tests/setup.ts).
- Unit tests are co-located next to the source they cover (`src/core/**/*.test.ts`, `src/store/**/*.test.ts`); `*.property.test.ts` / `*.fuzz.test.ts` use `fast-check` (password generator, vault serializer's malformed-payload handling).
- Integration tests in [tests/integration/](tests/integration/) exercise real WebCrypto end-to-end (no crypto mocks anywhere in this repo).
- **Playwright** E2E (`config/playwright.config.ts`) in [e2e/](e2e/), serial (`fullyParallel: false`) because tests share IndexedDB.
- Coverage thresholds 80/80/75/80 enforced in CI.

## Docs

- [LAUNCH.md](LAUNCH.md) — launcher usage and how to make a Start-menu / dock shortcut.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — comprehensive end-user guide (Hebrew).
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — known issues + recovery paths (Hebrew).
- [docs/CLI.md](docs/CLI.md) — the `sv` command line tool.
- [docs/adr/](docs/adr/) — architecture decision records (KDF choice, Recovery Kit snapshot design, no-PSL-dependency).
- [extension/README.md](extension/README.md) — extension dev install.

## Known gotchas

- **Device unlock (desktop).** "Remember this device" keeps the 64-byte derived key in the OS keystore via `safeStorage` (`src/electron/device-unlock.ts`), tied to the vault salt, 14-day max age, Touch ID on macOS. On Windows, when Hello is set up, the key is also wrapped (AES-256-GCM, `src/electron/key-wrap.ts`) with SHA-256 of a deterministic Windows Hello RSA signature (`src/electron/windows-hello.ts`, via the OS PowerShell + WinRT `KeyCredentialManager`), so DPAPI alone can't unwrap it; without Hello it falls back to DPAPI only. A password unlock only `refresh`es the timestamp (no prompt). E2E sets `SV_DEVICE_UNLOCK_NO_HELLO=1` (honoured only in unpackaged builds). Raw keys leave `core/` only through `exportDeviceKey` / `openVaultWithDeviceKey`. WebAuthn PRF unlock is not built (no usable rpId for a `file://` renderer).
- **i18n is a proof of concept.** Real infrastructure (`src/i18n/`, en/he locales), but only the Unlock page is migrated to `useTranslation()` — every other page/component still has hardcoded English regardless of the language setting. Deliberately partial, not half-finished.
- **Packaged renderer is served from `app://securevault`** (`src/electron/app-protocol.ts`), not file:// (the GrantFileProtocolExtraPrivileges fuse blocks file:// in the asar). IndexedDB origin is therefore `app://securevault` in packaged builds and `http://localhost:5173` in dev.
- **Native-messaging host is a standalone binary** in packaged builds (`scripts/build-bridge-host.mjs`, a Node single executable, shipped in `resources/bridge-host`), so the RunAsNode fuse is off. Dev still registers a wrapper that runs `bridge-host.js` with Electron in Node mode. The macOS host is single-arch for now, see [docs/RELEASE.md](docs/RELEASE.md).
- **No remote favicons** (`EntryFavicon` is letters only): loading them leaked the vault's site list to a third party. See [PRIVACY.md](PRIVACY.md).
- **Extension store packages**: `pnpm build:extension:release` strips dev hosts; icons are generated by `scripts/generate-icons.cjs` (final branding is an owner decision).
- **QR backup** uses `qrcode-generator` (full spec) in `VaultBackupQR.modal.tsx`; the old hand-rolled `src/lib/qrcode.ts` was removed. Still verify with a real scanner.
- **WebDAV pull never overwrites blindly**: pull → `RemoteUnlockModal` (remote master password) → `ConflictResolutionModal` (merge / keep local / keep remote) → autosave re-encrypts under the current session keys.
- **`ImportVault` 50 MB cap reads the full file into memory.** Streaming parser preferred for large LastPass exports.
- **SSH agent (desktop, opt-in).** `src/electron/ssh-agent.ts` only frames the agent protocol on a per-user pipe/socket; keys and the approval dialog stay in the renderer (`ssh-agent.service.ts`). List + sign only (no add/remove), Ed25519 only, every sign approved (optional 10-minute per-key memory, cleared on lock). E2E drives it with the real Windows OpenSSH `ssh-add` / `ssh-keygen -Y sign`.
- **Attachments.** Per-file AES-256-GCM key in `entry.attachments[]` (inside the vault), id bound as AAD; ciphertext in the separate IndexedDB `securevault-attachments` (`services/attachment-store.ts`). `IPCService.vault.delete()` clears them (duress, danger zone); unreferenced blobs are GC'd on unlock. Not synced over WebDAV yet.
- **Folder sync (desktop).** `src/electron/folder-sync.ts` writes `Vaultkin.svault` (ciphertext only, validated) to the user-chosen folder after each autosave; it remembers the hash it last read/wrote and returns `conflict` instead of overwriting another device's copy. Pull goes through the same RemoteUnlock → ConflictResolution flow as WebDAV. E2E uses `SV_FOLDER_SYNC_DIR` (unpackaged only).
- **`BulkActionBar` only supports delete**, not move-to-folder or add-tag — a known, scoped limitation, not an oversight.
