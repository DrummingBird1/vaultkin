# SecureVault Browser Extension

A companion Chrome/Edge/Brave extension that adds password autofill to your
browsing experience. The extension does NOT decrypt your vault on its own —
it receives an already-decrypted snapshot from the main SecureVault app via
a permissioned message channel, and holds it in memory for up to 5 minutes
of inactivity.

## Architecture

```
┌────────────────────────┐         ┌─────────────────────────┐
│  SecureVault Web App   │  send   │  Extension Background   │
│  (localhost:5173)      │ ──────▶ │  Service Worker         │
│  Settings → Send       │ entries │  (in-memory cache only) │
└────────────────────────┘         └────────┬────────────────┘
                                            │
                              chrome.runtime.sendMessage
                                            │
                  ┌─────────────────────────┴──────────────────────────┐
                  ▼                                                    ▼
          ┌──────────────┐                                   ┌──────────────────┐
          │ Popup (UI)   │                                   │ Content Script   │
          │ Browse / Lock│                                   │ Detect password  │
          │              │                                   │ inputs, autofill │
          └──────────────┘                                   └──────────────────┘
```

## Development install

1. **Build the main app and run it on `http://localhost:5173`** (so the
   externally_connectable origin matches).
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** → select the `extension/` folder.
5. The 🔐 icon should appear in your toolbar.

## Production install

Once stable: zip the `extension/` folder and submit to the Chrome Web Store.
You'll need to update `externally_connectable` in `manifest.json` to your
production hosted origin.

## Files

- `manifest.json` — MV3 declaration, permissions, icons.
- `src/background.js` — service worker; holds the in-memory entry cache.
- `src/content.js` — injected into pages; finds password inputs, offers fill.
- `src/content.css` — small floating UI styles.
- `popup/` — toolbar popup (HTML + CSS + JS).
- `icons/` — toolbar/store icons. **Replace placeholders** before publishing.

## Security

- ✅ Cache cleared after 5 min idle, on browser close, on extension reload.
- ✅ `host_permissions` requested at runtime per page (`activeTab`).
- ✅ All injected DOM uses `setReactValue` to fire proper React events.
- ✅ Messages from the main app validated by `externally_connectable` origin
       allow-list (set per environment).
- ⚠️  This is a **scaffold**. Before production:
   - Generate proper PNG icons (see `icons/README.md`).
   - Add per-domain match scoring (currently exact + subdomain only).
   - Add unit tests for `findMatchingEntries`.
   - Audit the message flow against the [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/mv3/security).
