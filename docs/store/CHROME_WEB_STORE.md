# Chrome Web Store listing

The text to paste into the Chrome Web Store developer dashboard for the
Vaultkin extension. Build the package with `pnpm build:extension:release` and
zip the contents of `dist/extension/` (the release job does this as
`Vaultkin-extension-chrome-<tag>.zip`).

## Store listing

**Name:** Vaultkin

**Summary** (from `extDescription`, max 132 characters):
Autofill logins, one-time codes and passkeys from your Vaultkin desktop app.

**Category:** Tools (Productivity › Tools)

**Language:** English (Hebrew is included through `_locales/he`)

**Description:**

> Vaultkin is a zero-knowledge password manager and authenticator for the
> desktop. This extension connects Chrome to the Vaultkin desktop app so you
> can fill logins, one-time codes (TOTP) and passkeys on websites.
>
> - Fills only logins whose site matches the page you are on.
> - Offers to save a login after you sign in on a site.
> - Shows the current one-time code for the site.
> - No account and no cloud: the extension talks only to the Vaultkin app on
>   your computer, through Chrome native messaging.
> - Logins are held in memory only while the app is unlocked, and are wiped
>   after 5 minutes of inactivity or when the app locks.
>
> Requires the Vaultkin desktop app (Windows, macOS, Linux), free and open
> source under GPL-3.0: https://github.com/DrummingBird1/vaultkin
>
> After installing, open Settings → Browser extension in the app, paste this
> extension's ID and confirm the pairing code.

**Homepage:** https://github.com/DrummingBird1/vaultkin
**Support:** https://github.com/DrummingBird1/vaultkin/issues

**Graphics:**
- Icon 128×128: `extension/icons/icon-128.png`
- At least one screenshot, 1280×800 or 640×400 (still to make: the popup on
  a login page, and the app's pairing screen).
- Small promo tile 440×280 (optional).

## Privacy practices

**Single purpose:**
Fill and save website logins, one-time codes and passkeys from the user's
Vaultkin desktop password manager.

**Permission justifications:**

| Permission | Why |
|---|---|
| Host permission `<all_urls>` | The content script finds login forms on any site the user visits and fills them on request. Filling only happens for an exact domain match. |
| `nativeMessaging` | The only channel to the Vaultkin desktop app, which holds the vault. The extension has no network access of its own. |
| `activeTab` | The popup reads the URL of the current tab to show that site's logins and sends the fill request to that tab. |
| `alarms` | A one-minute check that wipes the in-memory login cache after 5 minutes of inactivity. |
| `clipboardWrite` | The popup's copy button for a password or one-time code; the clipboard is cleared again after 30 seconds. |

**Remote code:** No. All code is in the package; the extension page CSP is
`script-src 'self'`.

**Data usage** — declare:
- Authentication information (passwords, one-time code secrets, passkeys)
- Website content (the URL and login form fields of the current page)

Both are handled only on the device, passed between the page and the local
desktop app, and never sent to the developer or any server.

Certify all three: not sold to third parties, not used for unrelated
purposes, not used for creditworthiness or lending.

**Privacy policy URL:**
https://github.com/DrummingBird1/vaultkin/blob/master/PRIVACY.md

## Distribution

Public, all regions. Free.

## After the first upload

The store assigns a fixed extension ID. Users paste it in the app's
Settings → Browser extension. Once the ID is known, it can be shipped as the
app's default so pairing needs no copy-paste.
