# 0005: Typed hash routing on the UI store instead of a router library

**Status:** Accepted (2026-11-21)

## Context

Navigation was a single `activePage` value in `ui.store`: no Back/Forward, no
way to link to a Settings section, and a reload always landed on the vault.
The upgrade plan named TanStack Router as the default choice.

## Decision

A ~30-line typed hash router (`src/lib/route.ts`) on top of the existing store:

- Routes are `#/<page>` or `#/<page>/<section>`, parsed against a strict
  allowlist of pages and a `[a-z0-9-]` section pattern.
- `ui.store.setActivePage(page, section?)` updates state and pushes a history
  entry; `useHashRoute` applies the URL on load and on Back/Forward.
- Routes never carry vault data: no entry ids, search text or folder names,
  so nothing about the vault's contents lands in browser history.

Chosen over TanStack Router because hash routing works identically under
Electron's `file://` and in a browser tab, every existing `setActivePage`
caller keeps working unchanged, and a password manager benefits from one
fewer runtime dependency.

## Consequences

- Revisit if the app grows nested layouts or route-level data loading; the
  store API (`setActivePage`) would stay the same and could be backed by a
  library later.
