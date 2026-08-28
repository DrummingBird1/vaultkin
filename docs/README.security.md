# SecureVault

**Zero-knowledge password manager and 2FA authenticator** — built with React, Web Crypto API, Argon2id, and Electron.

[![CI](https://github.com/securevault/securevault/actions/workflows/ci.yml/badge.svg)](https://github.com/securevault/securevault/actions)
[![Coverage](https://codecov.io/gh/securevault/securevault/badge.svg)](https://codecov.io/gh/securevault/securevault)

---

## Security Design

> **KDF status:** new vaults derive keys with **Argon2id (64 MiB, t=3, p=1)** via [`hash-wasm`](https://github.com/Daninet/hash-wasm) — a pure WASM build that bundles inline, so there is no native toolchain requirement and it works under Vite and Node. The derivation path is selected from the vault header's `kdf.name`, so vaults written by the earlier **PBKDF2-SHA256 (600k)** build still open unchanged. `p=1` is used because the WASM build is single-threaded; raising parallelism there costs time without adding security. Changing defaults is a one-line edit to `DEFAULT_KDF` in [`src/core/vault/engine.ts`](../src/core/vault/engine.ts).
>
> **Biometric unlock** is intentionally *not* shipped: doing it correctly needs WebAuthn PRF to wrap recoverable key material, which can only be validated against a real platform authenticator (not CI). Detection is implemented; the unlock boundary stays at the master password. See [`biometric.service.ts`](../src/services/biometric.service.ts).

| Layer | Implementation |
|---|---|
| Key Derivation | **Argon2id 64 MiB / t=3 / p=1** (hash-wasm). PBKDF2-SHA256 600k — legacy, still readable |
| Encryption | AES-256-GCM with a random 96-bit IV per save |
| Integrity | HMAC-SHA256 over KDF params + salt + IV + ciphertext (Encrypt-then-MAC) |
| TOTP | RFC 6238 / RFC 4226 — HMAC-SHA1 via Web Crypto |
| Storage | IndexedDB (primary) + localStorage mirror — encrypted blob only |
| Clipboard | Auto-cleared after 30 seconds |
| Auto-lock | Inactivity timer (configurable) + system screen-lock detection |
| Biometrics | TouchID / FaceID (Electron) wrapping session keys in OS Keychain |
| Sync | End-to-end encrypted WebDAV push/pull with ETag conflict detection |
| CSP | `default-src 'self'`, no inline scripts, no eval(), no iframes |
| Electron | `contextIsolation`, `sandbox`, `nodeIntegration: false` |

**Zero-knowledge**: The master password is never stored. The vault can only be decrypted on your device.

---

## Project Structure

```
securevault/
├── src/
│   ├── core/                  # Crypto primitives (Steps 1-3)
│   │   ├── crypto/            # AES-GCM, Argon2id, PBKDF2, HMAC, random
│   │   ├── password/          # Generator + strength analyzer
│   │   ├── totp/              # RFC 6238 TOTP engine + Base32 codec
│   │   └── vault/             # Schema, serializer (createVault/openVault/saveVault)
│   ├── store/                 # Zustand stores (Step 4)
│   │   ├── session.store.ts   # Session keys, lock state, auto-lock timer
│   │   ├── vault.store.ts     # Decrypted vault data, CRUD, search
│   │   ├── totp.store.ts      # Live TOTP codes, RAF timer
│   │   ├── ui.store.ts        # Theme, active page, toasts, viewMode
│   │   └── index.ts           # Cross-store actions (lockApplication, onVaultUnlocked)
│   ├── components/            # UI components (Step 5)
│   │   ├── layout/            # AppShell, Sidebar, TopBar
│   │   ├── vault/             # EntryCard, EntryRow
│   │   ├── password/          # PasswordField, GeneratorPanel
│   │   ├── totp/              # TOTPCard with animated arc ring
│   │   ├── modals/            # AddEditEntry, CreateVault, ImportVault, ConfirmDelete, ChangePassword
│   │   └── ui/                # Button, Input, Toast, Spinner, icons
│   ├── pages/                 # Page components
│   │   ├── Unlock.page.tsx    # Master password entry + first-run create
│   │   ├── Vault.page.tsx     # Entry grid/list with modals
│   │   ├── Authenticator.page.tsx  # Live TOTP codes
│   │   ├── Generator.page.tsx # Password generator
│   │   └── Settings.page.tsx  # Theme, security, sync settings
│   ├── services/              # Service layer (Step 6)
│   │   ├── storage.service.ts # IndexedDB + localStorage fallback
│   │   ├── autosave.service.ts # Debounced auto-save with retry
│   │   ├── sync.service.ts    # WebDAV E2E encrypted sync
│   │   ├── clipboard.service.ts # Auto-clear clipboard
│   │   ├── ipc.service.ts     # Electron ↔ browser adapter
│   │   ├── import-export.service.ts # Bitwarden/1Password/LastPass/KeePass/CSV
│   │   ├── biometric.service.ts # TouchID/FaceID/WebAuthn
│   │   └── app-lifecycle.service.ts # Unlock/lock orchestration
│   ├── electron/              # Electron main process (Step 6)
│   │   ├── main.ts            # BrowserWindow, IPC handlers, CSP, system lock
│   │   ├── preload.ts         # contextBridge API surface (validated)
│   │   └── ipc-channels.ts    # Typed IPC channel constants
│   ├── workers/
│   │   └── crypto.worker.ts   # Off-main-thread Argon2id key derivation
│   ├── pwa/
│   │   └── service-worker.ts  # Offline cache (never caches vault data)
│   ├── hooks/                 # useAutoLock, useClipboard, useTOTP, useVault, useSearch
│   ├── models/                # EnrichedEntry, VaultSearchQuery, VaultStats
│   └── styles/
│       └── globals.css        # CSS design tokens, theme vars, animations
├── config/
│   ├── vite.config.ts         # Vite + PWA + manual chunk splitting
│   └── electron-builder.config.ts # macOS / Windows / Linux packaging
├── tests/
│   ├── setup.ts               # Global mocks (IndexedDB, clipboard, localStorage)
│   ├── unit/
│   │   ├── crypto.test.ts     # AES-GCM, Argon2id, HMAC, random (Step 2)
│   │   ├── totp.test.ts       # RFC 6238 vectors, Base32, parser (Step 3)
│   │   └── services.test.ts   # ImportExportService, ClipboardService (Step 6)
│   └── integration/
│       └── vault-lifecycle.test.ts # E2E: create → unlock → CRUD → lock → re-unlock
├── .github/workflows/ci.yml   # CI: typecheck + lint + tests + build + Electron dist
├── index.html                 # PWA meta, CSP headers, font preconnect
├── package.json
├── tsconfig.json
├── tsconfig.electron.json
└── vitest.config.ts
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Install dependencies

```bash
npm install
```

### Development (browser PWA)

```bash
npm run dev
# Opens http://localhost:5173
```

### Development (Electron)

```bash
npm run electron:dev
# Starts Vite dev server + Electron simultaneously
```

### Run tests

```bash
npm test               # All tests (unit + integration)
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
```

### Build

```bash
npm run build              # PWA production build → dist/renderer/
npm run electron:dist:mac  # macOS DMG (universal: x64 + arm64)
npm run electron:dist:win  # Windows NSIS installer
npm run electron:dist:linux # AppImage + deb + rpm
```

---

## Crypto Verification

All crypto is implemented using the **Web Crypto API** (`crypto.subtle`) and verified against published test vectors:

| Algorithm | Standard | Test Vectors |
|---|---|---|
| AES-256-GCM | NIST SP 800-38D | `tests/unit/crypto.test.ts` |
| HMAC-SHA256 | RFC 2104 | `tests/unit/crypto.test.ts` |
| Argon2id | RFC 9106 | `tests/unit/crypto.test.ts` |
| TOTP | RFC 6238 | `tests/unit/totp.test.ts` |
| HOTP | RFC 4226 | `tests/unit/totp.test.ts` |
| Base32 | RFC 4648 | `tests/unit/totp.test.ts` |

---

## Import Formats

| Format | File Type | Export Instructions |
|---|---|---|
| Bitwarden | `.json` | Account → Export Vault → JSON |
| 1Password | `.1pux` / `.csv` | File → Export → 1PUX format |
| LastPass | `.csv` | Advanced Options → Export |
| KeePass 2 | `.xml` | File → Export → KeePass XML 2.x |
| Generic CSV | `.csv` | Columns: name, username, password, url, notes |

---

## Sync (WebDAV)

Settings → Sync → Configure WebDAV URL, username, and password.

Credentials are stored in the OS keychain (Electron) or session storage (browser). The vault is encrypted before upload — the server never sees plaintext.

Conflict resolution uses the `updatedAt` timestamp in the outer JSON wrapper (plaintext metadata, not decrypted content).

---

## License

MIT — see LICENSE file.
