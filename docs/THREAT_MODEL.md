# SecureVault threat model (STRIDE)

Scope: the Electron desktop app, the browser extension and the native-messaging
bridge between them (ADR 0007), and optional WebDAV sync. Cryptography details are in
[README.security.md](README.security.md).

## Assets

- **Vault plaintext:** entries, TOTP secrets, passkey private keys, notes.
- **Master password and derived keys.** The keys live only in renderer memory while
  the vault is unlocked.
- **Pairing keys for the bridge.** These are stored inside the vault.

## Trust boundaries

1. Renderer ↔ main process (IPC, preload `contextBridge`).
2. Desktop app ↔ native-messaging host ↔ browser extension.
3. Extension content script ↔ the web page it runs in.
4. Device ↔ the network (HIBP range API, the user's WebDAV server).

## Threats and mitigations

| STRIDE | Threat | Mitigation | Status |
|---|---|---|---|
| **S**poofing | A rogue local process pretends to be the browser extension | ECDH pairing confirmed by comparing a 6-digit code; the host reports the browser-supplied origin; replayed or unknown keys are rejected | Done (M3) |
| S | A web page pretends to be the extension or the user | Overlay in a closed shadow root; `isTrusted` checks on clicks; autofill matches the exact host only; a second click is needed for another host or a cross-site frame | Done (M3) |
| **T**ampering | A modified vault file or sync blob | Encrypt-then-MAC (HMAC-SHA256); typed `VaultCorruptError` | Done |
| T | Tampered app binary or ASAR | Electron fuses (ASAR integrity, only-load-from-ASAR) plus code signing | **Open** (release pipeline, M6) |
| **R**epudiation | The user can't tell that duress fired | `sv_duress_triggered_at` marker, shown after the next unlock | Done |
| **I**nformation disclosure | Offline brute force of the vault | Argon2id 64 MiB, t=3 | Done |
| I | Offline brute force of the duress hash | Salted Argon2id 19 MiB, t=2 (was unsalted SHA-256) | Done (M4) |
| I | Screenshots, screen sharing or recording capture secrets | `setContentProtection(true)` (Windows and macOS) | Done (M4) |
| I | An unattended unlocked vault (sleep, screen lock, user switch) | `powerMonitor` locks the vault at once; inactivity auto-lock | Done (M4) |
| I | Injected script exfiltrates data | Production CSP: `default-src 'self'`, `connect-src 'self' https:`, `object-src 'none'`, `frame-src 'none'` | Done (M4) |
| I | Renderer navigated to a hostile page, or a `<webview>` attached | `will-navigate`, `will-redirect` and `will-attach-webview` are all blocked; external links open only for http(s) URLs | Done (M4) |
| I | Clipboard history or cloud clipboard keeps copied passwords | Clipboard is cleared after copy | **Partial**: Windows clipboard-history exclusion not done yet |
| I | Plaintext WebDAV credentials in `sessionStorage` | Planned: move them inside the vault | **Open** |
| I | Plaintext cached in the extension | Data minimization; 5-minute idle wipe; wiped on lock | Done |
| **D**enial of service | Duress wipes the local vault | By design; synced copies are untouched (documented) | Accepted |
| **E**levation of privilege | Renderer compromise reaches Node | `sandbox`, `contextIsolation`, no `nodeIntegration`; IPC handlers check the sender and validate input | Done |
| E | A site gains camera, mic, HID or similar | Every permission request and check is denied | Done (M4) |
| E | `ELECTRON_RUN_AS_NODE` abuse | Needed by the native host today. Disabling the RunAsNode fuse requires a standalone host binary first | **Open** |

## Out of scope

- Malware running as the same OS user while the vault is unlocked. It can read process
  memory or log keystrokes. No local password manager can defend against this.
- A compromised browser.
- Physical attacks on an unlocked, unattended machine before the auto-lock fires.

## Still to do (M4 remainder and later)

- OS keychain "remember this device" via `safeStorage`, gated by Windows Hello or
  Touch ID.
- WebAuthn PRF unlock.
- Optional Secret Key.
- WebDAV credentials stored inside the vault.
- Clipboard-history exclusion.
- Fuses, signing, SBOM and provenance in the release pipeline.
- An external audit before 1.0.
