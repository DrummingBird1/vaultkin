# Vaultkin user guide

> Hebrew version: [USER_GUIDE.he.md](USER_GUIDE.he.md)

## What is Vaultkin?

A password manager and 2FA authenticator with **local-only encryption** (zero-knowledge):
your master password never leaves your device, and your data is encrypted before it is written to disk. If you forget your master password, there is no recovery. That is the only way to make sure nobody but you can see your data.

---

## Contents

1. [Install and run](#install-and-run)
2. [Creating your first vault](#creating-your-first-vault)
3. [Daily use](#daily-use)
4. [Keyboard shortcuts](#keyboard-shortcuts)
5. [Password Health Dashboard](#password-health-dashboard)
6. [Duress password](#duress-password)
7. [Browser extension](#browser-extension)
8. [QR backup](#qr-backup)
9. [Conflict resolution](#conflict-resolution)
10. [WebDAV sync](#webdav-sync)
11. [Export and import](#export-and-import)
12. [Security under the hood](#security-under-the-hood)
13. [Troubleshooting](#troubleshooting)
14. [Development and testing](#development-and-testing)
15. [License](#license)

---

## Install and run

### Requirements
- **Node.js 20+** (`node -v`)
- **pnpm 9+**
- macOS / Windows / Linux

### Install dependencies
```bash
git clone https://github.com/DrummingBird1/vaultkin.git
cd vaultkin
pnpm install
```

### Run in development mode (browser)
```bash
pnpm dev
```
Open `http://localhost:5173`.

### Run as a desktop app
```bash
pnpm electron:dev
```
A standalone window, with TouchID/FaceID support, a tray icon and access to the system keychain.

### Production build
```bash
pnpm build                  # PWA (browser)
pnpm electron:dist:mac      # macOS DMG (Universal)
pnpm electron:dist:win      # Windows NSIS installer
pnpm electron:dist:linux    # AppImage / deb / rpm
```

---

## Creating your first vault

1. On first launch you will see **"No vault found"**.
2. Click **"Create New Vault"**.
3. Choose a **Master Password**:
   - The strength meter must show "Strong" or better (3 out of 4).
   - Not sure? Click **"Suggest strong password"** to generate a random 24-character password.
4. *(Optional)* **Hint**: a reminder shown to you if you forget. **Do not write the password itself!** The hint is stored unencrypted in localStorage.
5. **Create Vault**: Argon2id takes 1-2 seconds.

> ⚠️ **Warning**: keep the password somewhere safe (a note in a safe, and so on). There is no recovery.

---

## Daily use

### Navigation
| 🎨 | Screen | What it gives you |
|----|--------|-------------------|
| 🔑 | **Vault** | All your entries: passwords, notes, credit cards |
| 🛡️ | **Authenticator** | Live 2FA codes (TOTP) with automatic refresh |
| 🔄 | **Generator** | Strong, customizable passwords |
| 🛡️ | **Password Health** | Health check and breach scan |
| ☁️ | **Sync** | WebDAV setup |
| ⚙️ | **Settings** | Theme, accent color, security, change password |

### Adding a new entry
- Click **+ Add Entry** or press `Ctrl/⌘+N`.
- Fill in the form:
  - **Title** (required)
  - **Username / Email**
  - **Password**: an icon to generate one, and a live strength meter
  - **URL**: adds https if it is missing
  - **TOTP Secret**: Base32, validated as you type
  - **Notes**: Markdown is supported! ([see example](#markdown-in-notes))
  - **Custom Fields**: click **"Use template"** to pick from 8 ready-made templates

### Custom field templates
Click "Use template" to add a set of fields in one click:
- 💳 Credit Card
- 🔑 SSH Key
- 🌐 API Credentials
- 📶 Wi-Fi
- 📘 Passport
- 🏦 Bank Account
- 📜 Software License
- ₿ Crypto Wallet

### Search
- `Ctrl/⌘+K` or `/` focuses the search field.
- Searches title, username, URL and category (case-insensitive).
- `Esc` clears it.

### Quick copy
- Click any field in the detail panel to copy it to the clipboard.
- The clipboard is cleared automatically after **30 seconds** (configurable in Settings).

### Drag and drop
- In list view (not while searching): drag entries to reorder them.
- The order is saved in the vault and shown every time you open it.

### Markdown in notes
The Notes field supports:
```markdown
## Recovery Codes
- **123456** (used)
- 789012

## Steps to reset
1. Visit https://example.com/account
2. Click *Reset password*
3. Check email

> Quote: keep this secure!

`code snippet`
```

### Version history
Each time you edit an entry, the previous version is kept **in memory** (not on disk). When you open an existing entry you will see a **"History (3)"** button that shows the last 10 versions. Click a version to restore it.
> **Important**: history is erased on lock. It does not carry across sessions.

### Bulk actions
Click **"Select"** in the toolbar, then select several entries to act on them together.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘+K` | Focus search |
| `Ctrl/⌘+N` | New entry |
| `Ctrl/⌘+L` | Lock now |
| `Ctrl/⌘+G` | Generator |
| `Ctrl/⌘+,` | Settings |
| `/` | Search (when not in a text field) |
| `?` | List of shortcuts |
| `Esc` | Close modal / clear search |

---

## Password Health Dashboard

Screen: **🛡️ Password Health**.

### What does it show?
- **Compromised passwords**: passwords found in breach databases.
- **Weak passwords**: entropy below 60 bits.
- **Reused passwords**: the same password in several entries.
- **Old passwords**: not changed for 90+ days.
- **Missing passwords**: login entries without a password.
- **No 2FA enabled**: logins with a URL but no TOTP.

### Overall score
A 0-100 score based on the ratio of issues to total login entries:
- **80-100**: Excellent (green)
- **60-79**: Good (yellow)
- **40-59**: Fair (orange)
- **0-39**: Poor (red)

### Scan for breaches
Click the button to check against **Have I Been Pwned**.

> 🔒 **Privacy**: only the first 5 characters of the SHA-1 hash are sent. The rest of the hash is compared locally against the 500+ candidates that come back. The password itself never leaves your device. This is the same model used by Bitwarden, 1Password and Firefox Lockwise.

---

## Duress password

### What is it?
A second password you set up. If someone forces you to open the vault, you type the duress password instead of the real one.

### What happens?
1. The real vault is **completely deleted** from the device.
2. A new, empty vault is created with the duress password as its master password.
3. To the attacker it looks like a successful unlock, but there is nothing there.
4. The next time you open the app on your own, you will see a red warning: **"Duress unlock was triggered on [date]"**.

### Setup
1. **Settings → Security → Duress password**.
2. Choose a password (6+ characters, must differ from the master password).
3. Confirm your current password.
4. **Enroll**.

### Good to know
- Duress only deletes the **local copy**. A cloud backup (WebDAV) is not touched.
- An attacker can in theory notice what happened. This is plausible deniability, not perfect concealment.

---

## Browser extension

### Install (development)
1. Run `pnpm build:extension`.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. **Load unpacked** → choose the `dist/extension/` folder.
4. Copy the **Extension ID** from the page.

Firefox 128+: see [extension/README.md](../extension/README.md).

### Connecting to the desktop app
1. In Vaultkin: **Settings → Browser extension**, paste the Extension ID.
2. Click **Set up browser connection**.
3. Open the extension popup and click **Connect**.
4. Approve in the app only if the 6-digit code matches on both sides.

The web build (no desktop app) has **Send entries to extension** instead: an in-memory copy that is erased after 5 minutes idle.

### Security
- The extension cannot decrypt the vault on its own.
- The desktop connection is end-to-end encrypted, and the extension receives only the logins for the current site.

---

## QR backup

Export the **encrypted** vault as a series of QR codes.

### When to use it?
- A printed physical backup (keep it somewhere secure!).

### How?
1. **Settings → Export → "Show as QR codes"**.
2. Each QR holds about 240 bytes. An average vault needs 5-15 QR codes.
3. Scroll or use the left/right arrows to see them all.
4. To restore, scan every code with a phone or scanner app and paste their text under **Restore from backup** (any order). The app does not scan with the camera.

### Important
- The QR codes contain the vault **encrypted**. Reading them back still needs the master password.
- Each QR is marked `SVQR:N/M:` with its place in the series.

### Restore from backup
Available on the first screen when there is no vault, and in **Settings → Sync** to merge into an open vault. It opens:
- a `.svault` file, including a Recovery Kit (enter its recovery passphrase);
- the text of scanned QR codes.

On an empty device, the backup's password becomes the master password. After restoring a Recovery Kit, change it in Settings. Attachments are not included in these backups.

---

## Conflict resolution

When you pull a vault from WebDAV or a sync folder, nothing is replaced until you choose:
1. Enter the remote vault's master password, and the comparison opens.
2. You will see a list:
   - 🔴 **Conflicts**: the same entry changed on both sides
   - 🟡 **Local only**: exists on your side, not remotely
   - 🔵 **Remote only**: exists remotely, not on your side
   - ⚪ **Identical**: the same on both sides
3. Choose a strategy:
   - **Merge (recommended)**: combines everything, and for conflicts picks the later `updatedAt`.
   - **Keep local**: leaves the local vault as it is. Use **Push** to update the server.
   - **Keep remote**: overwrites the local copy.
4. **Apply resolution**.

---

## WebDAV sync

### Setup
1. **Settings → Sync**.
2. Enter:
   - **WebDAV URL**: the full URL of the vault file (for example `https://nextcloud.example.com/remote.php/webdav/vaultkin.svault`)
   - **Username**
   - **Password** (an app password if you use 2FA)
3. Click **Connect**.

### How does it work?
- WebDAV sync is manual. Autosave does not upload to it.
- **Push** uploads the saved encrypted vault. If the server copy has changed since this vault last saw it, the app asks you to pull first or to confirm the overwrite. The first Push to an existing file asks too.
- **Pull** downloads the server file, asks for its master password and opens the merge view.
- Attachments are not synced over WebDAV.

### Restoring from WebDAV on a new device
The server address and credentials are stored inside the vault, so a new device does not know them.
1. Create a new vault.
2. **Settings → Sync**: enter the WebDAV URL, username and password, then click **Connect**.
3. Click **Pull**. Do not choose **Overwrite server copy**: it would replace your backup.
4. Enter the master password of the backed-up vault.
5. Choose **Keep remote** and apply. The entries are saved under the new vault's master password.
6. Check your entries before you push.

### Credentials
- Stored **inside the encrypted vault** (in its settings), so they are only available while the vault is unlocked and are cleared from memory on lock.
- Not stored in localStorage or sessionStorage. Older versions kept them in sessionStorage; they are moved into the vault and removed from there automatically.
- `https://` URLs only. Sync over plain http is blocked so the WebDAV password is never sent in the clear.

---

## Export and import

### Import
**Vault → Import**:
- **Bitwarden JSON**
- **LastPass CSV**
- **Generic CSV** (also for 1Password and KeePass: export to CSV there; 1PUX and KeePass XML files are not supported yet)

The format is detected automatically. For conflicts: **Skip / Overwrite / Keep both**.

### Export
- **Encrypted backup** (JSON): cannot be opened without the password. Safe to store in the cloud.
- **CSV (not encrypted!)**: **only for a one-off move**. Delete it afterwards!
- **QR codes**: see above.

---

## Security under the hood

```
Master Password
     │
     ▼
Argon2id (64 MiB, t=3, p=1)  ←──  random 32-byte salt
     │
     ▼ derives 64 bytes
┌────┴────┐
│ encKey  │ AES-256-GCM (vault encryption)
│ macKey  │ HMAC-SHA256  (header integrity)
└─────────┘

Encrypt-then-MAC:
    Vault JSON → AES-256-GCM(encKey, IV) → ciphertext
    Header (version, IV, salt, kdfParams) → HMAC-SHA256(macKey) → headerMac

VaultPayload = { version, magic, kdf, kdfParams, salt, iv, vaultId,
                 updatedAt, data: ciphertext, headerMac }

Verification on unlock:
    HMAC verify FIRST → fast-fail on tampering before decryption
    Then AES decrypt → JSON parse → return VaultData
```

### Key properties
- **TOTP**: RFC 6238 (compatible with Google Authenticator, Authy).
- **CSP** in Electron: `default-src 'self'`, no eval, no iframes.
- **Sandbox + contextIsolation + nodeIntegration: false** in Electron.
- The **Service Worker** does not cache vault data, only the app shell.
- **Auto-lock** after 5 minutes of inactivity (configurable).
- **Memory wipe** of session keys on lock (`Uint8Array.fill(0)`).

---

## Troubleshooting

### Black screen when opening the app
**Fixed in this version!** The app now wraps everything in an `ErrorBoundary` that shows a friendly message instead of a blank screen.
If it still happens:
1. `Ctrl+Shift+R` for a hard refresh.
2. F12 → Console: what is the error?
3. Check that `pnpm install` completed (native modules sometimes cause problems).

### "Incorrect master password"
- Make sure you are using the right password.
- If you set a hint, it is shown above the field.
- If you typed the **duress password** by mistake, your vault was deleted. Check the trigger banner in Settings → Security.

### "Sync failed"
- The local save succeeded; your vault is safe.
- Check the WebDAV URL and credentials.
- Try **Push** or **Pull** again. Sync is not retried automatically.

### Windows Hello / Touch ID unlock is not offered
- Turn on **Remember this device** in Settings → Security.
- The master password is required at least every 14 days.

### The browser extension does not see entries
- Check the Extension ID, click **Set up browser connection** again, then **Connect** in the extension popup.
- Make sure the app is running and the vault is unlocked.

More in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Development and testing

### Tests
```bash
pnpm test
pnpm test:coverage
```

### E2E
```bash
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:headed
pnpm test:e2e:electron
```

### Lint + typecheck
```bash
pnpm lint
pnpm typecheck
```

### CI
- Every push to `master` → typecheck + lint + tests + build (Linux/macOS/Windows).
- Every `v*.*.*` tag → Electron builds for all platforms + a GitHub Release (draft).

---

## License

**GPL-3.0-only**. See [LICENSE](../LICENSE).

Bugs and suggestions → open an issue on GitHub.

🔐 **Stay safe.**
