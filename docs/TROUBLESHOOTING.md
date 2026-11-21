# Vaultkin troubleshooting

> Hebrew version: [TROUBLESHOOTING.he.md](TROUBLESHOOTING.he.md)

## Contents
- [Black / blank white screen](#black--blank-white-screen)
- [Installation errors](#installation-errors)
- [`npm install` fails](#npm-install-fails)
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

### `npm install` fails

**Common symptoms:**
- An error in `argon2-browser` or `keytar`.
- A native compile error (`gyp ERR!`).

**Fixes:**
```bash
# 1. Make sure you have Node 20+
node -v

# 2. Clear the cache and node_modules
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# 3. If keytar fails (common on Linux):
sudo apt install libsecret-1-dev  # Debian/Ubuntu
sudo dnf install libsecret-devel  # Fedora

# 4. If argon2-browser fails, make sure python3 + make + g++ are installed:
sudo apt install build-essential python3
```

### "ERESOLVE could not resolve" / peer dependency conflicts
```bash
npm install --legacy-peer-deps
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
1. ✅ Is the extension installed (`chrome://extensions/`)?
2. ✅ Is the Extension ID entered in Settings → Security → Browser Extension?
3. ✅ Does `externally_connectable.matches` in the extension's `manifest.json` include your origin (`http://localhost:5173/*`)?
4. ✅ Did you click **"Send entries to extension"**?
5. ✅ Has the cache not expired (5 minutes since sending)?

### Debug
1. Open the extension's service worker:
   - `chrome://extensions/` → Vaultkin → "Service worker" link → DevTools.
2. In the Console look for logs: `[SV-Ext] Received N entries from main app`.
3. If there is no message, the message did not arrive. Check `externally_connectable`.

### The 🔐 icon does not appear on password fields
- The content script is not running. Check:
  - `chrome://extensions/` → "Errors" for any errors.
  - Pages with a very strict CSP (banking sites, GitHub) block inline scripts. This is known.

---

## Biometric unlock does not work

**Known**: in the current version, biometrics requires you to unlock with the master password the first time after installation. The full flow (decrypt-with-keys-only) is still in development.

Workaround: unlock with the password on each startup. Biometrics will be offered on that login, but it will not work.

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

### `npm test`: vitest fails on crypto
- Node 20+ must provide `globalThis.crypto.subtle`. If it does not:
  ```bash
  node -v   # make sure it is 20+
  ```
- Tests run in jsdom. If there is a problem with the IndexedDB mock, check `tests/setup.ts`.

### `npm run test:e2e`: Playwright timeouts
- The Vite dev server is not running:
  ```bash
  # in a separate terminal
  npm run dev
  # then
  npx playwright test
  ```
- The environment is slow: raise the timeouts in `playwright.config.ts` (currently 60s).

### Coverage below the threshold
- `vitest.config.ts` requires 80% lines + 80% functions + 75% branches + 80% statements.
- CI error? Add tests; do not lower the threshold.

---

## Electron does not start

### `npm run electron:dev` fails
- Is Vite running first? `electron:dev` runs both through concurrently. Check there is no port conflict on 5173.
- macOS Catalina+: you need codesigning, or disable Gatekeeper (`spctl --master-disable`) **for development only**.

### "Cannot find module 'keytar'"
```bash
cd node_modules/keytar && npm run rebuild
# or:
npm rebuild keytar
```

### The window opens but is empty
- Check the Electron DevTools: `View → Toggle Developer Tools`.
- Make sure the CSP is not blocking something (`Content Security Policy directive: "default-src 'self'"...`).

---

## More problems?

- 🐛 Open an issue on GitHub
- 📋 Include: version (`Vaultkin Settings → About`), OS, browser, and a screenshot of the Console.
- 🔒 **Do not include**: your vault, passwords, or any credential.
