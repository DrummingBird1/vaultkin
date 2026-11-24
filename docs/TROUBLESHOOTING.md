# Vaultkin troubleshooting

> Hebrew version: [TROUBLESHOOTING.he.md](TROUBLESHOOTING.he.md)

## Contents
- [Black / blank white screen](#black--blank-white-screen)
- [Installation errors](#installation-errors)
- [`pnpm install` fails](#pnpm-install-fails)
- [Wrong password / "Incorrect master password"](#wrong-password)
- [The vault does not load](#the-vault-does-not-load)
- [Sync does not work](#sync-does-not-work)
- [The browser extension does not see entries](#the-browser-extension-does-not-see-entries)
- [Biometric unlock does not work](#biometric-unlock-does-not-work)
- [Wrong TOTP code](#wrong-totp-code)
- [Tests fail](#tests-fail)
- [Electron does not start](#electron-does-not-start)

---

## Black / blank white screen

**Fixed in this version.** The chain of broken imports between `engine.ts`, `serializer.ts` and `session.store.ts` was closed, and the `ErrorBoundary` now wraps the whole app.

If the screen is still black:
1. **Hard refresh**: `Ctrl+Shift+R` (`⌘+Shift+R` on Mac).
2. **DevTools** (F12) → Console: are there red errors? Take a screenshot and attach it to an issue.
3. **Corrupt localStorage?**
   ```js
   // In the DevTools console:
   localStorage.clear();
   indexedDB.deleteDatabase("securevault");
   location.reload();
   ```
   ⚠️ This deletes the local vault. If you have a cloud backup (WebDAV), it will load from there on the next login.
4. **Broken service worker cache**:
   - `chrome://serviceworker-internals/` → unregister
   - or DevTools → Application → Service Workers → Unregister.

---

## Installation errors

### `pnpm install` fails

Make sure you have Node 20+ and pnpm 9+, then install from the lockfile:
```bash
node -v
pnpm -v
pnpm install --frozen-lockfile
```

---

## Wrong password

### "Incorrect master password"

**Possibilities:**
1. **You really mistyped it**: check Caps Lock, keyboard layout, spaces.
2. **You have a duress password set**: if you typed *that* by mistake, your vault **has already been deleted from this device**. Check Settings → Security for a red duress-trigger banner.
3. **The payload is damaged**: if you opened the DB in an IndexedDB inspector and changed bytes, the HMAC fails and you get this error (even with the right password).

**Recovery:**
- If you have a WebDAV backup: delete the local vault (`localStorage.clear()` + `indexedDB.deleteDatabase("securevault")`), sign in again, and the app pulls it from the cloud.
- If not: **there is no recovery**. Create a new vault from scratch.

### I completely forgot the password
There is no recovery. That is what makes the app zero-knowledge: if there were a backdoor, it would not be zero-knowledge.

Your options:
1. Check other password managers where you may have saved it.
2. Check whether you set a **hint** (shown above the password field).
3. Import your data from its original source (Bitwarden, 1Password, etc.) and start a new vault.

---

## The vault does not load

### Symptom: clicking Unlock does nothing
- DevTools → Network: is there a call to `indexedDB`?
- DevTools → Application → IndexedDB: is there a DB named `securevault`?
  - If yes: check whether the `vault` store contains an object.
  - If not: create a new vault.

### Symptom: "Failed to unlock vault. The file may be corrupted."
- The `headerMac` check failed. Either the vault was changed by hand, or Argon2 returned a different value (this happened in the past with WASM issues).
- Try the vault backed up in the cloud.

---

## Sync does not work

### "Sync failed"
- The local save **succeeded**; your vault is safe. Sync will try again on the next save.
- Check:
  1. The **WebDAV URL** is correct and ends with `/`.
  2. The **credentials** are correct. With 2FA on Nextcloud you need an **app password**, not your main password.
  3. CORS: if the server does not send the right `Access-Control-Allow-Origin`, it will fail. This is usually Nextcloud/ownCloud, and using the Electron app instead of the browser is enough.

### "Sync conflict"
- Both you and the other device changed the vault since the last sync.
- Open the Conflict Resolution modal (Settings → Sync → Resolve) and choose a strategy.

---

## The browser extension does not see entries

### Checklist
1. The app is running and the vault is unlocked.
2. The extension is installed and enabled (`chrome://extensions/`).
3. The Extension ID is correct in Settings → Browser extension, and you clicked **Set up browser connection**.
4. You clicked **Connect** in the extension popup and approved it in the app.
5. Web build only: send **Send entries to extension** again (the copy is erased after 5 minutes idle).

### Debug
`chrome://extensions/` → Vaultkin → "Service worker" → Console.

### The 🔐 icon does not appear on password fields
- The content script is not running. Check:
  - `chrome://extensions/` → "Errors" for any errors.
  - Pages with a very strict CSP (banking sites, GitHub) block inline scripts. This is known.

---

## Biometric unlock does not work

Turn on **Remember this device** in Settings → Security (desktop app). The master password is required at least every 14 days. On Windows, the Windows Hello prompt may open behind the app window.

---

## Wrong TOTP code

### My code is not accepted by the site
- **Clock**: TOTP depends on a synchronized clock. If your device's clock is off, the codes will be wrong.
  - macOS: `sudo sntp -sS time.apple.com`
  - Windows: Settings → Time & Language → Sync now
  - Linux: `timedatectl set-ntp true`
- **Drift**: if the time is right and it is still wrong, check that the Base32 secret matches exactly (capital letters, no spaces).
- **Time window**: the default is 30 seconds. Most sites accept ±1 window (60 seconds total). If the site is very strict, try to submit faster.

### "Invalid Base32"
- RFC 4648 Base32 only: A-Z, 2-7, and sometimes `=` for padding.
- Some sites give the secret with spaces (`ABCD EFGH IJKL`); the app removes them.
- Some give it in lowercase; it is converted automatically.

---

## Tests fail

### `pnpm test`: vitest fails on crypto
- Node 20+ must provide `globalThis.crypto.subtle`. If it does not:
  ```bash
  node -v   # make sure it is 20+
  ```
- Tests run in jsdom. If there is a problem with the IndexedDB mock, check `tests/setup.ts`.

### `pnpm test:e2e`: Playwright timeouts
- The Vite dev server is not running:
  ```bash
  # in a separate terminal
  pnpm dev
  # then
  pnpm test:e2e
  ```
- The environment is slow: raise the timeouts in `config/playwright.config.ts` (currently 60s).

### Coverage below the threshold
- `config/vitest.config.ts` requires 80% lines + 80% functions + 75% branches + 80% statements.
- CI error? Add tests; do not lower the threshold.

---

## Electron does not start

### `pnpm electron:dev` fails
- Is Vite running first? `electron:dev` runs both through concurrently. Check there is no port conflict on 5173.

### The window opens but is empty
- Check the Electron DevTools: `View → Toggle Developer Tools`.
- Make sure the CSP is not blocking something (`Content Security Policy directive: "default-src 'self'"...`).

---

## More problems?

- 🐛 Open an issue on GitHub
- 📋 Include: version (`Vaultkin Settings → About`), OS, browser, and a screenshot of the Console.
- 🔒 **Do not include**: your vault, passwords, or any credential.
