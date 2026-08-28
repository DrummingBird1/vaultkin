# 🔐 SecureVault

A zero-knowledge password manager and 2FA authenticator built with React, TypeScript, Vite, and Electron. Cross-platform (Web / macOS / Windows / Linux), with an optional companion Chrome extension for autofill.

## Highlights

- **Zero-knowledge** — master password never leaves the device. Vault is encrypted with AES-256-GCM (Encrypt-then-MAC, HMAC-SHA256). Keys are derived with **Argon2id (64 MiB, t=3, p=1)** via WASM; vaults created by the earlier PBKDF2-SHA256 build still open (the KDF is chosen from the vault header). See [security notes](docs/README.security.md).
- **2FA built in** — RFC 6238 TOTP authenticator co-located with your passwords.
- **Password Health dashboard** — surfaces weak / old / reused / pwned passwords with a 0-100 score.
- **Have I Been Pwned check** — k-anonymity breach detection (only 5 hex chars of the hash leave the device).
- **Duress password** — secondary password that wipes the local vault and shows an empty decoy.
- **Browser extension** — companion Chrome MV3 extension for autofill on web pages.
- **QR backup** — export the encrypted vault as a series of QR codes for offline transfer.
- **Markdown notes**, **custom field templates** (Credit Card, SSH, API, Wi-Fi, Passport, Bank, License, Crypto), **drag & drop reorder**, **keyboard shortcuts**, **per-entry version history** (in-memory).
- **Multi-format import** — Bitwarden, 1Password, LastPass, KeePass, generic CSV.
- **WebDAV sync** with end-to-end encryption and a side-by-side conflict resolution UI.

## Quick start

```bash
npm install
npm run dev          # web at http://localhost:5173
npm run electron:dev # native desktop app
```

For the full user guide (Hebrew) see [USER_GUIDE.md](./USER_GUIDE.md).
For troubleshooting (Hebrew) see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
For the change history see [CHANGELOG.md](./CHANGELOG.md).

## Project structure

```
securevault/
├── src/
│   ├── core/                    # crypto + vault format (clean, testable)
│   │   ├── crypto/              # AES-GCM, Argon2id, HMAC, PBKDF2
│   │   ├── vault/               # schema, serializer, vault-types, field-templates
│   │   ├── totp/                # RFC 6238 / 4226 implementation
│   │   └── password/            # generator + strength analyzer
│   ├── components/
│   │   ├── ui/                  # primitives (button, input, modal)
│   │   ├── modals/              # full-screen modals (AddEdit, CreateVault, …,
│   │   │                        #   ConflictResolution, VaultBackupQR, ShortcutsHelp)
│   │   ├── layout/              # AppShell, Sidebar, TopBar
│   │   ├── settings/            # SecurityPanel
│   │   └── ErrorBoundary.tsx    # crash safety net
│   ├── pages/
│   │   ├── Vault.page.tsx
│   │   ├── Authenticator.page.tsx
│   │   ├── Generator.page.tsx
│   │   ├── Health.page.tsx       ← password health dashboard
│   │   ├── Settings.page.tsx
│   │   └── Unlock.page.tsx
│   ├── services/
│   │   ├── breach.service.ts     ← HIBP k-anonymity
│   │   ├── duress.service.ts     ← duress password
│   │   ├── history.service.ts    ← per-entry version history
│   │   ├── extension-bridge.service.ts ← messages to browser extension
│   │   ├── ipc.service.ts
│   │   ├── clipboard.service.ts
│   │   ├── biometric.service.ts
│   │   ├── autosave.service.ts
│   │   ├── sync.service.ts
│   │   ├── import-export.service.ts
│   │   ├── storage.service.ts
│   │   └── app-lifecycle.service.ts
│   ├── store/                    # Zustand: session / vault / totp / ui
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── useQuickCopy.ts
│   │   ├── useBulkSelection.ts
│   │   ├── useDragReorder.ts
│   │   └── useAutoLock.ts
│   ├── lib/
│   │   ├── encoding.ts
│   │   ├── markdown.ts           ← lightweight Markdown renderer
│   │   └── qrcode.ts             ← zero-dep QR encoder
│   └── electron/                 # main process + preload
├── extension/                    # MV3 browser extension scaffold
│   ├── manifest.json
│   ├── src/{background,content}.{js,css}
│   ├── popup/{popup.html,popup.css,popup.js}
│   └── icons/icon.svg
├── e2e/                          # Playwright tests
│   ├── 01-vault-lifecycle.spec.ts
│   └── 02-keyboard-shortcuts.spec.ts
├── tests/                        # Vitest unit + integration tests
├── .storybook/                   # Storybook config
├── playwright.config.ts
├── vitest.config.ts
└── package.json
```

## Security design

| Layer            | Algorithm                                  | Reference          |
|------------------|--------------------------------------------|--------------------|
| Key derivation   | Argon2id (m=64MiB, t=3, p=2)               | RFC 9106           |
| Encryption       | AES-256-GCM                                | NIST SP 800-38D    |
| Integrity        | HMAC-SHA256 (Encrypt-then-MAC)             | RFC 2104           |
| 2FA              | TOTP (HMAC-SHA1/256/512, 6/8 digits)       | RFC 6238           |
| Storage          | IndexedDB (browser) / OS keychain (desktop)| —                  |
| Clipboard        | Auto-clear after 30s (configurable)        | —                  |
| Auto-lock        | 5min inactivity (configurable, system-aware)| —                 |
| Browser extension| In-memory cache, 5min TTL, externally_connectable allow-list | — |
| Sync             | E2E encrypted WebDAV                       | RFC 4918           |
| CSP (Electron)   | `default-src 'self'`, no eval, no iframes  | —                  |
| Sandbox          | contextIsolation + sandbox + nodeIntegration: false | Electron Best Practices |

## Build

```bash
npm run build                     # PWA bundle
npm run electron:dist:mac         # macOS DMG (Universal: x64 + arm64)
npm run electron:dist:win         # Windows NSIS installer
npm run electron:dist:linux       # AppImage + deb + rpm
```

## Test

```bash
npm test                          # Vitest unit + integration
npm run test:coverage             # with coverage thresholds (80/80/75/80)
npm run test:e2e                  # Playwright in headless Chrome
npm run test:e2e:headed           # with visible browser
npm run storybook                 # component dev environment
```

## Browser Extension

See [`extension/README.md`](./extension/README.md) for development install instructions. Currently a working scaffold; before publishing to the Chrome Web Store, replace placeholder PNG icons and update `externally_connectable` for your production origin.

## License

MIT
