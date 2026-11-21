# `sv`: SecureVault on the command line

Read-only access to your vault from scripts and terminals: list entries,
print a password, username, URL, notes, the current 2FA code, an SSH public
key or a custom field, and fill templates such as `.env` files.

## Setup

1. In the desktop app, open **Settings → Sync → Sync folder** and choose a
   folder. The app keeps an encrypted copy there (`SecureVault.svault`).
   `sv` reads that file. It finds it automatically, or you can pass `--vault`
   or set `SV_VAULT`.
2. Build it: `pnpm build:cli`. Then run `node dist/cli/sv.cjs …`. With
   `pnpm link --global` it's available as `sv`.

## Commands

```bash
sv list [filter]                  # id, type, title, username (never secrets)
sv get "GitHub"                   # password
sv get "GitHub" totp              # current 2FA code
sv get "Prod DB" host             # custom field by label
sv inject -i .env.tpl -o .env     # fills {{ sv://<title>/<field> }}
```

Templates reference entries by title or id. Percent-encode spaces in a title,
for example `{{ sv://Prod%20DB/password }}`. Output files are created with
mode 0600, and `inject` won't overwrite an existing file without `--force`.

## The master password

`sv` asks for it at a hidden prompt, or reads it from stdin with
`--password-stdin` (for example from your OS keychain tool). It is never
taken from an argument or an environment variable: both are visible to other
processes or end up in shell history.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | OK |
| 1 | Usage error or I/O error |
| 2 | Ambiguous query |
| 3 | No match, or the field is missing |
| 4 | Wrong master password |
| 5 | Damaged vault file |
