# 0007: Browser extension ↔ desktop app over native messaging, end-to-end encrypted

**Status:** Accepted (2026-11-21)

## Context

The extension could only talk to the web build (`externally_connectable` on
localhost), and only by the app *pushing* a plaintext snapshot of entries into
the extension's memory for 5 minutes. It could not work with the installed
desktop app, and the snapshot model keeps decrypted credentials in a second
process for longer than needed.

## Decision

**Transport.** Chrome/Edge/Firefox native messaging. A host manifest
(`com.securevault.bridge`) points the browser at the Vaultkin executable,
which, when launched with the extension origin as its argument, runs in
*relay mode*: no window, no vault, just copying length-prefixed JSON frames
between the browser's stdio and a per-user local socket (Windows named pipe /
Unix domain socket in the user's data directory) served by the running app.

**End-to-end encryption.** The relay and the Electron main process only ever
see ciphertext. The two endpoints are the extension's service worker and the
app's *renderer* (where the vault keys live):

- Each side has an ECDH P-256 key pair. The extension's private key is a
  non-extractable `CryptoKey` kept in its own IndexedDB; the app's paired
  extension public keys are stored inside the encrypted vault.
- **Pairing** (once per browser profile): both sides exchange public keys and
  display a 6-digit code derived from both keys and the extension origin
  (SHA-256 → digits). The user confirms the codes match *in the app*; only then
  is the extension's public key pinned. This defeats a malicious local process
  posing as either side (numeric comparison, as in Bluetooth pairing).
- **Session**: ECDH shared secret → HKDF-SHA-256 (salt = both public keys,
  info = "securevault-bridge-v1") → AES-256-GCM key. Every message carries a
  strictly increasing counter, bound into the GCM additional data together with
  the direction; replays and reordering are rejected.

**What the app answers** (renderer, vault unlocked, sender paired):
`status`, `credentials-for-url` (strict registrable-domain match, invariant 9
field set only), `totp-for-entry`. Everything else is refused. A locked vault
answers `locked` and the extension asks the user to unlock the app.

## Consequences

- The extension works with the desktop app and holds no long-lived plaintext
  cache; each fill is a request for just that site's entries.
- Installing the host manifest is an explicit user action in Settings
  ("Connect browser"), per browser, writing only under the user's profile
  (HKCU on Windows).
- The relay runs the full Electron binary; a slimmer dedicated host binary can
  replace it later without protocol changes.
- The old `externally_connectable` snapshot push remains for the web build
  until the bridge ships in the store extension, then is removed.
