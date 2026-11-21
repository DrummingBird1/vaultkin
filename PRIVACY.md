# Privacy policy

Vaultkin is a local password manager. It has no accounts, no servers of
its own, no analytics and no telemetry. This page lists everything the app
and the browser extension send over the network, and when they send it.

## What stays on your device

- **Your vault.** Logins, notes, cards, 2FA secrets, passkeys, SSH keys,
  attachments and settings are encrypted on your device. Encryption uses
  AES-256-GCM with a key derived from your master password by Argon2id.
- **Your master password.** It is never stored or sent anywhere.
- **Crash dumps and logs.** These are written to the app's data folder only
  and are never uploaded.

## Network requests the app makes

| When                                        | Where                                        | What is sent                                                                                                                   |
| ------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| You click "Scan for breaches" in Watchtower | `api.pwnedpasswords.com` (Have I Been Pwned) | The first 5 characters of the SHA-1 hash of the password being checked (k-anonymity). Never the password, never the full hash. |
| You set up WebDAV sync and push or pull     | The WebDAV server **you** configure          | The encrypted vault file, and your WebDAV username and password (https only)                                                   |
| You click "Check for updates" (desktop)     | GitHub Releases for this project             | A normal request for the latest release information                                                                            |

Nothing else is requested:

- no website icons (favicons);
- no fonts from the web (they ship with the app);
- no tracking.

## The browser extension

- The extension talks only to the Vaultkin desktop app on the same
  computer, over native messaging. That connection is end-to-end encrypted
  after a pairing you confirm.
- For the site you're on, it receives only the matching logins:
  - title, address, username, password;
  - 2FA secret, for filling codes.
- It keeps them in memory for at most 5 minutes, and clears them when the app
  locks.
- It reads web pages only to find login and 2FA fields, and to offer saving a
  login after you sign in.
- Nothing it sees is sent anywhere except to your own desktop app.

## Sync folder, sharing and the CLI

- **Sync folder.** The app writes the encrypted vault file to a folder you
  choose. Any syncing of that folder is done by the tool you pick, such as
  Syncthing, OneDrive or Dropbox, under that tool's own privacy terms.
- **Secure sharing.** It creates an encrypted file and a separate code on your
  device. You decide how to send them.
- **`sv` CLI.** It reads the encrypted vault file locally and makes no
  network requests.

## Your control

- **Export.** You can export your vault at any time.
- **Deleting the vault.** Settings → Danger zone removes the vault and all
  attachments from the device.
- **Uninstalling.** The vault is stored in the app's data folder. Uninstalling
  doesn't delete it; delete that folder to remove it.

## Changes

Changes to this policy are listed in [CHANGELOG.md](CHANGELOG.md).
