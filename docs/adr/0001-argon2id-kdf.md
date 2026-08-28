# 0001: Argon2id as the default KDF, PBKDF2 kept for backward compatibility

**Status:** Accepted

## Context

The master password is the only secret protecting the vault (zero-knowledge
model — see `docs/README.security.md`). Everything downstream (AES-256-GCM
encryption key, HMAC-SHA256 MAC key) is derived from it via a key derivation
function. The KDF is the primary defense against an offline brute-force
attack on a stolen vault file, so its cost parameters matter more here than
in almost any other part of the app.

The project shipped an early build on PBKDF2-SHA256 (600,000 iterations,
per current OWASP guidance at the time) because it's built into WebCrypto —
`crypto.subtle.deriveBits({name: "PBKDF2", ...})` — with no extra dependency
and no WASM. Argon2id is the modern recommendation (winner of the Password
Hashing Competition, resistant to GPU/ASIC parallelization in a way PBKDF2
fundamentally isn't, since PBKDF2's cost is pure iteration count with no
memory-hardness), but the Web Crypto API doesn't implement it — there's no
browser-native primitive.

## Decision

- New vaults use **Argon2id** via `hash-wasm` (`DEFAULT_KDF` in
  `src/core/vault/engine.ts`: 64 MiB memory, `t=3` iterations, `p=1`
  parallelism) — chosen over `argon2-browser`/native bindings because
  `hash-wasm` is pure WASM with no native toolchain requirement, works
  identically under Vite (browser) and Node (tests), and has no
  postinstall compile step to break across platforms.
- **The KDF is recorded in the vault payload header** (`kdf.name`,
  `kdf.iterations`, `kdf.memoryKiB`, `kdf.parallelism` — see
  `VaultPayload` in `src/core/vault/vault-types.ts`), not hardcoded per
  build. `openVault()` reads it from the payload and derives accordingly.
- **PBKDF2-SHA256 vaults keep opening**, indefinitely — `deriveRawBytes()`
  in `engine.ts` branches on `kdf.name`. Nobody is forced to lose access to
  an existing vault because the KDF recommendation changed.
- **Migration is explicit and user-initiated**, not automatic. Settings
  shows an "Upgrade encryption" banner when `sessionKeys.kdf.name ===
  "PBKDF2-SHA256"`; `UpgradeEncryption.modal.tsx` re-derives with the new
  KDF using the *same* password the user already knows (verify old
  password → `changeMasterPassword(vault, samePassword)`, which always
  derives with `DEFAULT_KDF`). No silent background re-encryption —
  re-keying is exactly the kind of operation that should be visible and
  confirmable, not something that happens invisibly on next unlock.

## Consequences

- Every vault, forever, needs both derivation paths supported in
  `engine.ts` — this is permanent complexity, not a temporary shim to
  delete later. Any *third* KDF added later (should Argon2id itself ever
  be deprecated) would need the same treatment: read from payload, never
  silently switch.
- `openVault()` must validate `kdf.name` and `kdf.iterations` before use —
  see `src/core/vault/serializer.fuzz.test.ts` and the fix it drove: an
  unrecognized `kdf.name` used to fall through to the PBKDF2 branch
  silently instead of failing with `VaultCorruptError`.
- Users on legacy PBKDF2 vaults get weaker protection until they explicitly
  upgrade. This is a known, accepted tradeoff of "explicit over automatic"
  — the alternative (auto-upgrade on unlock) would mean quietly doing
  expensive Argon2id work and rewriting the vault file the first time
  someone unlocks after an update, which is surprising behavior for a
  password manager to do without asking.
