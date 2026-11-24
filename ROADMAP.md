# Vaultkin roadmap

Source of truth for where Vaultkin is going. Updated with each release or
change of plan. Last update: 2026-11-24.

## Where it stands

- **Current:** `v1.0.0-beta.2`, a public pre-release (desktop app
  for Windows, macOS and Linux, plus the browser extension packages).
  Published 2026-11-24.
- **Repo:** public, GPL-3.0-only. CI is green on all three operating systems
  and all three browser engines.
- Everything shipped so far is listed in [CHANGELOG.md](CHANGELOG.md).

## Done (milestones M0–M6)

- **M0/M1 foundation:** verified baseline, stack upgrades, UI primitives,
  vault format v2 with migrations, unit tests for every service.
- **M2 design and UX:** new design system, command palette, Quick Access
  window, onboarding, full Hebrew and RTL, WCAG 2.2 AA checks in CI.
- **M3 integrations:** native-messaging bridge to the extension (paired,
  encrypted), autofill v2 with save prompts, passkeys, Watchtower dashboard.
- **M4 security hardening:** device unlock through the OS keystore and
  Windows Hello, salted Argon2id duress password, Electron fuses and CSP,
  clipboard and screen-capture protection, threat model.
- **M5 beyond parity:** SSH agent, encrypted attachments, secure sharing,
  `sv` CLI, folder sync and WebDAV merge.
- **M6 release prep:** name and logo (Vaultkin), standalone extension host
  (RunAsNode fuse off), universal macOS host, release pipeline with
  checksums, SBOM and build provenance, privacy policy, license.

## Needs the owner

- **Name check:** trademark and domain for "Vaultkin".
- **Manual checks on real hardware:** pairing the extension in Chrome with
  the installed app, Windows Hello unlock, WebDAV sync with a real server,
  installing and updating, Recovery Kit restore and QR scanning.

## Next (toward 1.0.0)

1. Store listings: Chrome Web Store, Edge Add-ons, Firefox AMO, with
   screenshots.
2. Fix whatever the beta turns up, then tag `v1.0.0`.

## Backlog

- macOS Developer ID signing and notarization (when there is demand).
- External security audit before a stable 1.0 recommendation.
- Attachments over WebDAV sync (today they sync only through folder sync).
- Bulk actions beyond delete (move to folder, add tag).
- Streaming import for very large exports (today capped at 50 MB in memory).
- WebAuthn PRF unlock with hardware keys (needs a usable rpId for the
  desktop renderer).
- Docs site (user guide in Hebrew and English).

## Dropped

- Windows code signing through SignPath: not a 1.0 requirement. Windows builds
  stay unsigned and SmartScreen warns
  (see [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md)).
- Mobile apps and a hosted server: out of scope by design (desktop app plus
  extension, zero-knowledge, no server).
- Remote favicons: removed because they leaked the vault's site list
  (see [PRIVACY.md](PRIVACY.md)).
