# AGENTS.md

This file gives Codex essential context for working in this repo. Keep it short and durable; link out to canonical docs instead of duplicating them.

## What this is

**SecureVault** — a zero-knowledge password manager + 2FA authenticator. React + TypeScript + Vite + Electron, with a companion Chrome MV3 browser extension for autofill.

- Master password never leaves the device.
- AES-256-GCM encryption, Argon2id KDF (64 MiB, t=3, p=2), HMAC-SHA256 (Encrypt-then-MAC).
- RFC 6238 TOTP, HIBP k-anonymity breach check, duress password, WebDAV E2E sync.
- See [README.md](README.md), [docs/README.security.md](docs/README.security.md), [CHANGELOG.md](CHANGELOG.md) for the full picture.

## Running locally

```bash
npm install
npm run dev               # Vite at http://localhost:5173
npm run electron:dev      # Electron + Vite (HMR)
```

Or just double-click [`launch.bat`](launch.bat) (Windows). See [LAUNCH.md](LAUNCH.md) for cross-platform launchers and shortcut creation.

## Repo layout

The snapshot was reorganized on 2026-05-17 into the canonical tree:

```
securevault/
├── launch.{bat,ps1,sh}                       # one-click launchers
├── LAUNCH.md                                 # launcher usage / shortcut tips
├── index.html
├── package.json
├── vitest.config.ts
├── playwright.config.ts
├── src/
│   ├── App.tsx
│   ├── components/modals/                    # *.modal.tsx
│   ├── pages/                                # *.page.tsx
│   ├── services/                             # *.service.ts
│   └── lib/                                  # qrcode.ts (zero-dep encoder)
├── extension/
│   ├── manifest.json                         # MV3
│   └── src/{background,content}.js
├── tests/
│   ├── setup.ts                              # vitest polyfills
│   └── integration/vault-lifecycle.test.ts
├── e2e/01-vault-lifecycle.spec.ts            # Playwright
├── docs/                                     # Hebrew user docs
│   ├── USER_GUIDE.md
│   ├── TROUBLESHOOTING.md
│   └── README.security.md
├── .github/workflows/ci.yml
└── mnt/user-data/outputs/securevault/extension/README.md
```

> **Snapshot caveat:** This working tree only contains a subset of the original project. Modules referenced by imports — `src/core/`, `src/store/`, `src/services/{clipboard,ipc,import-export,sync,...}`, `src/components/{ui,layout,settings}/`, `src/hooks/`, `src/pages/{Authenticator,Generator,Settings,Authenticator}.page.tsx`, `src/electron/`, `src/styles/globals.css`, `config/vite.config.ts`, `config/electron-builder.config.ts` — are **not** in the snapshot and must be restored before `npm run dev` will actually work. The launchers will run but fail until then.

## Architectural invariants (do not violate)

Load-bearing for the zero-knowledge model. Breaking them is a security regression, not a refactor.

1. **Master password never leaves the device.** No telemetry, no error reports include vault content. The HIBP check sends 5 hex chars of a SHA-1 hash, nothing more.
2. **Crypto types in one place** — `src/core/vault/vault-types.ts` is the single source of truth for `SessionKeys`, `VaultPayload`, `VaultPayloadSchema`, `wipeSessionKeys`, `createDefaultVaultData`. Both `engine.ts` and `serializer.ts` import from there.
3. **`serializer.ts` is the public façade.** Outside `core/`, code calls `createVault` / `openVault` / `reEncryptVault` / `changeMasterPassword` from `serializer.ts`. It does not poke at the engine's raw `Uint8Array` key API.
4. **Memory hygiene on lock.** `BreachService._cache`, `HistoryService.versions`, `ExtensionBridge` cache **must** be cleared in `AppLifecycle.onLock`. Adding a new in-memory cache holding plaintext-derived data? Wire it into lock teardown.
5. **`ErrorBoundary` wraps the whole tree.** Crashes must not leak a blank screen.
6. **Password strength API.** Exported function is `analyzeStrength(...)`, entropy field is `effectiveEntropy`. Older `analyzePassword` / `analysis.entropy` references are a known bug — fix, don't preserve.
7. **`lockApplication` reasons.** Valid `LockReason`: `"manual"`, `"inactivity"`, `"duress"`. Not `"system"`.
8. **Electron sandbox.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP `default-src 'self'`. Don't loosen.
9. **Browser extension data minimization.** `ExtensionBridge` sends only `{id, title, url, username, password, totpSecret}`. Cache auto-wipes after 5 min idle. Autofill enforces strict domain match (after the phishing-protection fix); generous match is only used for "what entries belong to this site".
10. **Duress password.** Stored as SHA-256 hash in `localStorage` under `sv_duress_hash`. Constant-time comparison.

## Code style notes

- TypeScript strict; React functional components + Zustand stores.
- Tailwind utility classes plus an `sv-*` design-system layer (`sv-modal`, `sv-input`, `sv-btn-primary`, `sv-card`, ...) defined in `src/styles/globals.css`.
- Path aliases (vitest + vite): `@core`, `@services`, `@store`, `@components`, `@hooks`, `@pages`.
- Prefer existing `sv-*` primitives over rolling new ones.
- For new icons, prefer inline SVG primitives (`IconStar`, `IconClose`, `IconEmptyVault` in [Vault.page.tsx](src/pages/Vault.page.tsx)) over emoji — emoji renders differently per OS. Long-term plan: `lucide-react`.

## Testing

- **Vitest** with jsdom; polyfills in [tests/setup.ts](tests/setup.ts).
- Integration tests in [tests/integration/](tests/integration/) exercise real WebCrypto (no crypto mocks).
- **Playwright** E2E in [e2e/](e2e/), serial (`fullyParallel: false`) because tests share IndexedDB.
- Coverage thresholds 80/80/75/80 enforced in CI.

## Docs

- [LAUNCH.md](LAUNCH.md) — launcher usage and how to make a Start-menu / dock shortcut.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — comprehensive end-user guide (Hebrew).
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — known issues + recovery paths (Hebrew).
- [mnt/.../extension/README.md](mnt/user-data/outputs/securevault/extension/README.md) — extension dev install.

## Known gotchas

- **Biometric unlock is partial.** Master-password unlock is required at least once per session; keys-only path isn't wired. Current `handleBiometric` shows a clear "use master password" message.
- **Extension `externally_connectable.matches` contains a placeholder** (`https://*.your-securevault-host.com/*` in [extension/manifest.json](extension/manifest.json)). Replace before shipping.
- **Extension PNG icons are placeholders.** Generate real ones before Web Store submission.
- **QR encoder ([src/lib/qrcode.ts](src/lib/qrcode.ts)) is single-block / single-mask** and omits alignment patterns. Fine for v1; v2+ may not scan reliably. Verify with real scanners or swap for `qrcode-generator`.
- **`ImportVault` 50 MB cap reads the full file into memory.** Streaming parser preferred for large LastPass exports.
- **Snapshot is incomplete.** See "Snapshot caveat" above. The launchers and CI both expect the missing files.
