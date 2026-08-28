# SecureVault Browser Extension

A companion Chrome/Edge/Brave (MV3) extension that adds password autofill to
your browsing experience. The extension does **not** decrypt your vault on
its own — it receives an already-decrypted, minimal snapshot from the main
SecureVault app via a permissioned message channel, and holds it in memory
for up to 5 minutes of inactivity — the timeout value lives in
`src/constants/shared.json`, imported directly by both this background
worker and the main app's `src/constants/index.ts` (`EXTENSION_SESSION_TIMEOUT_MS`),
so the two can't drift out of sync.

## Architecture

```
┌────────────────────────┐         ┌─────────────────────────┐
│  SecureVault Web App   │  send   │  Extension Background   │
│  (Settings → "Send to  │ ──────▶ │  Service Worker         │
│   extension")          │ entries │  (in-memory cache only) │
└────────────────────────┘         └────────┬────────────────┘
                                            │
                              chrome.runtime.sendMessage
                                            │
                  ┌─────────────────────────┴──────────────────────────┐
                  ▼                                                    ▼
          ┌──────────────┐                                   ┌──────────────────┐
          │ Popup (UI)   │                                   │ Content Script   │
          │ Browse/copy/ │                                   │ Detect password  │
          │ fill / lock  │                                   │ inputs, autofill │
          └──────────────┘                                   └──────────────────┘
```

Only the web app (a page loaded in the browser) can push entries in — the
Electron desktop build has no `chrome.runtime` API, so the bridge is a no-op
there by design (Settings hides the controls and explains why in that case).

## Development install

1. Run the main app on `http://localhost:5173` (`pnpm run dev`) — that origin
   is already allow-listed in `manifest.json`'s `externally_connectable`.
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** → select the `extension/` folder directly (the
   plain, unbundled source — no build step needed for local dev, exactly
   like before the build pipeline below existed).
5. The SecureVault icon appears in the toolbar. Click it any time to see
   cached-entry status, search, copy, or fill for the active tab.
6. In the app: **Settings → Browser extension** → paste the extension ID
   (shown on the `chrome://extensions` card) → **Send entries to extension**.

## Build

```bash
pnpm run validate:extension   # checks manifest.json against Chrome Web
                               # Store constraints (required fields, size
                               # limits, MV3 CSP shape, broken file refs)
pnpm run build:extension      # bundles + minifies into dist/extension/,
                               # mirroring extension/'s exact file layout
```

Both run in CI (`.github/workflows/ci.yml`'s `extension` job) on every
change. `dist/extension/` is what you'd actually zip for a Chrome Web Store
submission — `extension/` itself stays the unbundled source used by
"Load unpacked" above, unchanged.

## Production install

Before publishing to the Chrome Web Store:

1. Replace the placeholder origin in `manifest.json`'s
   `externally_connectable.matches` and `content_security_policy` (currently
   `https://*.your-securevault-host.com/*`) with wherever you actually host
   the SecureVault web build. This is a template, not a real domain — leaving
   it as-is just means the production origin can't reach the extension yet;
   it's not otherwise a security hole.
2. `pnpm run build:extension`, then zip the contents of `dist/extension/`
   (not `extension/` — the dist output is what's actually minified/bundled)
   and submit it.
3. Consider commissioning a proper designed icon — `icons/*.png` and
   `build/icon.png` (desktop app) are currently generated programmatically
   (`scripts/generate-icons.cjs`, a solid-color lock glyph). Functional and
   crisp at all sizes, but not a substitute for real brand design.

## Files

- `manifest.json` — MV3 declaration, permissions, icons.
- `src/background.js` — service worker; holds the in-memory entry cache,
  answers status/lookup queries from the popup and content script.
- `src/content.js` — injected into pages; finds password inputs, offers a
  click-to-fill trigger + credential picker, and a strict-domain-match
  phishing confirmation before ever filling a password.
- `src/content.css` — styles for the injected trigger/tooltip/picker.
- `popup/` — toolbar popup (HTML + CSS + JS): status, search, copy, fill, lock.
- `icons/` — toolbar/store icons (16/32/48/128px).

## Security

- Cache cleared after 5 min idle, on explicit lock, or extension reload.
- `host_permissions` scoped to `activeTab` usage patterns; content script
  matches `<all_urls>` only to detect password fields, not to read page data.
- All injected DOM writes go through `setReactValue` so SPA frameworks pick
  up the change via proper `input`/`change` events.
- Messages from the main app are only accepted from origins listed in
  `externally_connectable` — anything else can't reach `onMessageExternal`.
- Autofill enforces an **exact-domain match** with a confirm dialog on
  mismatch (phishing protection) even though the background's own
  domain-match used for "what entries exist for this site" lookups is
  intentionally more generous — see the comment in `content.js`.
- Data sent to the extension is minimized to
  `{id, title, url, username, password, totpSecret}` — no notes, custom
  fields, or history.

## Known gaps

- No automated tests for `findMatchingEntries` / the content-script fill
  logic — CI validates the manifest and confirms the bundle builds, but
  Vitest's jsdom setup doesn't cover `chrome.*` APIs, so the actual runtime
  behavior still isn't unit-tested. Manual testing via "Load unpacked" is
  the current verification path.
- Domain matching is exact-or-subdomain only; no fuzzy/typo-squatting
  detection beyond the exact-match confirm dialog.
