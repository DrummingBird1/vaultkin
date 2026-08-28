# Security Policy

SecureVault is a zero-knowledge password manager. Vulnerabilities here can
directly expose people's credentials — please report responsibly rather than
opening a public issue.

## Reporting a vulnerability

**Preferred: GitHub Private Vulnerability Reporting.** Use this repository's
[Security tab → "Report a vulnerability"](../../security/advisories/new) to
open a private advisory. The maintainers get notified immediately, and
nothing is publicly visible until a fix ships and the advisory is disclosed.
(If that link 404s, private reporting hasn't been enabled on this repo yet —
enable it under Settings → Security → "Private vulnerability reporting", or
fall back to opening a regular issue that says only "security issue, please
contact me privately" with no technical detail, and a maintainer will follow
up with a private channel.)

**Do not** open a public GitHub issue with exploit details, proof-of-concept
code, or specifics of the vulnerability. Public issues are fine for "I think
X might be a problem" without specifics, or for already-disclosed/fixed CVEs.

## What's in scope

- The crypto core: `src/core/vault/{engine,serializer}.ts`, `src/core/totp/`,
  `src/core/password/`.
- Key derivation, encryption, and MAC verification (see
  [docs/README.security.md](docs/README.security.md) for the current design).
- Auth/unlock flow: master password handling, duress password, unlock
  throttling.
- The Electron main process and preload script (sandbox escapes, IPC
  surface).
- The browser extension's message-passing surface
  (`chrome.runtime.onMessageExternal`, content-script autofill matching).
- Sync (WebDAV client, conflict handling) and import/export.

## What's out of scope

- Denial-of-service against your own local instance (e.g. a giant import file
  hanging the UI) — annoying, but not a confidentiality/integrity issue for a
  local-first app. Still worth a regular issue.
- Social engineering, physical access to an unlocked/unattended device, or
  compromise of the OS itself.
- Missing HTTP security headers on `docs/` or other static content that
  carries no secrets.
- The unsigned installer "unknown publisher" warning — tracked, not a
  vulnerability (see `CLAUDE.md`'s known gotchas).
- Vulnerabilities that require the reporter to already have the master
  password or an unlocked session (report anyway if you think it's still
  interesting, just flag that it needs that precondition).

## What to include

- Steps to reproduce, ideally against a throwaway vault (never send us a real
  vault file or real master password).
- The version/commit you tested against.
- Impact: what an attacker gains, and what preconditions they need.

## Response

We aim to acknowledge within 7 days and to have at least a triage decision
(confirmed / not a vulnerability / needs more info) within 14. Fix timelines
depend on severity — critical key-handling issues get prioritized over
everything else, including in-flight feature work.

## Supported versions

This project doesn't yet have a formal LTS/backport policy — the `main`
branch and the most recent tagged release are what get fixes. If you're on
an older tag, please confirm the issue still reproduces on latest before
reporting.
