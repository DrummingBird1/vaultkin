# Vaultkin threat model (STRIDE)

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
| I | Clipboard history or cloud clipboard keeps copied passwords | Windows: copies carry `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory=0` and `CanUploadToCloudClipboard=0` (written through the OS PowerShell, secret on stdin); auto-clear after 30 s and on lock, but only if the clipboard still holds our copy | Done (M4). macOS/Linux have no history API; there it is the clear only |
| I | Plaintext WebDAV credentials in browser storage | Kept inside the encrypted vault (`settings.sync`); only readable while unlocked; legacy `sessionStorage` copy migrated and deleted; https-only | Done (M4) |
| I | Plaintext cached in the extension | Data minimization; 5-minute idle wipe; wiped on lock | Done |
| I | Stolen remembered device key | Opt-in; OS keystore (DPAPI / Keychain), bound to the OS user; tied to the current master-password salt; expires 14 days after the last master-password unlock; Touch ID on macOS, Windows Hello on Windows | Done (M4). Windows: also wrapped under a Windows Hello signature when Hello is set up, so another process as the same user can't unwrap it with DPAPI alone; DPAPI only when Hello isn't set up |
| E | Malware as the same user uses the SSH agent | Opt-in; per-user pipe/socket (0600 on Unix); nothing listed or signed while locked; every signature approved in the app (key name + remote account shown); approvals remembered ≤10 min per key, cleared on lock; keys never leave the renderer | Done (M5). Approval can't show the target host (not in the request) |
| I | Attachment files read from disk | Per-file random AES-256-GCM key stored only inside the encrypted vault; attachment id as AAD (no swapping); SHA-256 checked after decrypt; wiped with the vault (incl. duress) | Done (M5) |
| I | A shared item leaks | Opt-in per item; only the chosen fields (never SSH keys, passkeys, attachments, folder ids); random AES-256-GCM key sent as a separate code (two channels); expiry and sender bound as AAD | Done (M5). Expiry is enforced by the app, not cryptographically: anyone holding file + code can decrypt with their own tools |
| **D**enial of service | Duress wipes the local vault | By design; synced copies are untouched (documented) | Accepted |
| **E**levation of privilege | Renderer compromise reaches Node | `sandbox`, `contextIsolation`, no `nodeIntegration`; IPC handlers check the sender and validate input | Done |
| E | A site gains camera, mic, HID or similar | Every permission request and check is denied | Done (M4) |
| E | `ELECTRON_RUN_AS_NODE` abuse | RunAsNode fuse off in packaged builds; the native host is a separate binary (`resources/bridge-host`) | **Mitigated** |

## Out of scope

- Malware running as the same OS user while the vault is unlocked. It can read process
  memory or log keystrokes. No local password manager can defend against this.
- A compromised browser.
- Physical attacks on an unlocked, unattended machine before the auto-lock fires.

## Still to do (M4 remainder and later)

- WebAuthn PRF unlock.
- Optional Secret Key.
- Fuses, signing, SBOM and provenance in the release pipeline.
- An external audit before 1.0.
