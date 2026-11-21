# 0004: Versioned vault schema with forward-only migrations

**Status:** Accepted (2026-11-21)

## Context

The decrypted vault document had a `schemaVersion` field that was always `1`
and never checked. Any change to its shape (tombstones for sync merge,
persistent history, passkeys, attachments, per-item keys — all on the
roadmap) would have meant either breaking old vaults or scattering
"if field missing" checks through the app.

The encrypted envelope (`VaultPayload.version` in `engine.ts`) is a separate
concern: it changes only when the crypto format changes.

## Decision

- `src/core/vault/migrations.ts` owns `CURRENT_SCHEMA_VERSION` and a list of
  pure, forward-only steps (`v1 → v2`, `v2 → v3`, …). Steps never skip and
  must be idempotent on fields they already set.
- `serializer.openVault()` runs `migrateVault()` after decryption and returns
  `migrated: true` when it upgraded the document. The unlock flow then marks
  the vault dirty so autosave writes the upgraded document back, re-encrypted
  with the same keys.
- A document newer than `CURRENT_SCHEMA_VERSION` is refused with
  `VaultCorruptError` instead of being opened and silently downgraded on the
  next save.
- Schema v2 adds `tombstones: {id, deletedAt}[]` and guarantees every entry
  has `createdAt`/`updatedAt`. `core/vault/merge.ts` uses both so a deletion on
  one device isn't undone by another device's stale copy during a WebDAV merge.

## Consequences

- Every future shape change is one new step plus a test with a fixture of the
  previous version (see `migrations.test.ts`, which also fuzzes `migrateVault`
  with arbitrary input).
- Old app versions can't open vaults written by newer ones. That is
  intentional: opening and re-saving would drop the newer fields.
