# Architecture Decision Records

Short records of decisions that were non-obvious enough, or expensive enough
to reverse, that the reasoning is worth keeping searchable in one place
instead of scattered across code comments and `CHANGELOG.md` entries.

Not every decision gets one — only ones where a future contributor (including
a future you) would reasonably ask "wait, why didn't we just do X instead?"
and the answer isn't visible from the code alone.

## Format

Lightweight (Michael Nygard style): **Status**, **Context**, **Decision**,
**Consequences**. No fixed template file — copy the structure from an
existing ADR.

## Index

| # | Title | Status |
|---|-------|--------|
| [0001](0001-argon2id-kdf.md) | Argon2id as the default KDF, PBKDF2 kept for backward compatibility | Accepted |
| [0002](0002-recovery-kit-snapshot.md) | Recovery Kit as a point-in-time snapshot, not a live-synced second vault | Accepted |
| [0003](0003-no-psl-dependency.md) | Hand-curated multi-part-TLD list instead of the `psl` package | Accepted |
| [0004](0004-vault-schema-migrations.md) | Versioned vault schema with forward-only migrations | Accepted |
| [0005](0005-hash-routing.md) | Typed hash routing on the UI store instead of a router library | Accepted |
| [0006](0006-quick-access-in-main-window.md) | Quick Access reuses the main window instead of a second window | Accepted |

## Numbering

Sequential, never reused — a superseded decision gets a new ADR that says so
and links back, it doesn't overwrite the old number.
