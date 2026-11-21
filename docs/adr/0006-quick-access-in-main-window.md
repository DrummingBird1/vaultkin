# 0006: Quick Access reuses the main window instead of a second window

**Status:** Accepted (2026-11-21)

## Context

1Password-style "Quick Access" (a global hotkey that lets you search and copy
a credential from anywhere) usually opens a small separate window. In this app
the vault and its session keys live only in the main window's renderer
(IndexedDB + in-memory `SessionKeys`). A separate window is a separate
renderer process with its own memory.

Making a second window work would mean one of:
- unlocking it separately (master password again — defeats the purpose), or
- moving decrypted entries or keys between processes over IPC, which widens
  the attack surface and breaks the "keys live in one place" property that the
  memory-hygiene invariant (#4) relies on.

## Decision

`Ctrl/⌘+Shift+Space` (Electron `globalShortcut`) restores, shows and focuses
the main window and sends `sv-quick-access`; the renderer opens the command
palette, which already searches entries (title/username/URL only) and copies
password, username or the current 2FA code through the auto-clearing
clipboard. If the vault is locked, the unlock field is focused instead.

## Consequences

- No secret ever crosses a process boundary for Quick Access.
- It brings the full window forward rather than a compact overlay. A compact
  presentation can be added later as a *view* of the same window (e.g. resize
  + palette-only mode) without changing the security model.
