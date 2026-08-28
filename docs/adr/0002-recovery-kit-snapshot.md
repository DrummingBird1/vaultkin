# 0002: Recovery Kit as a point-in-time snapshot, not a live-synced second vault

**Status:** Accepted

## Context

A zero-knowledge password manager has an inherent recovery problem: if the
master password is forgotten, there is — by design — no way to decrypt the
vault. No password reset, no "forgot password" flow, because that would
require either a server that can decrypt vaults (breaks zero-knowledge) or
a recovery secret weaker than the master password itself (weakens the whole
model). The feature request was for *some* recovery path without
compromising either property.

Two shapes were considered:

1. **Live-synced multi-key vault**: the vault format supports N independent
   wrapped copies of the same data-encryption key, one wrapped under the
   master password, one wrapped under a separately-generated recovery key.
   Both stay valid and current at all times — lose the master password,
   the recovery key still opens the *current* vault.
2. **Point-in-time snapshot**: a completely separate, independently
   encrypted export — its own salt, its own derived key, its own copy of
   the vault contents as of the moment it was generated — created on
   demand and downloaded as a file.

## Decision

Went with **(2), the snapshot**, implemented in
`src/components/modals/RecoveryKit.modal.tsx` by reusing the existing
`createVault()`/`generatePassphrase()` functions from
`src/core/vault/serializer.ts` and `src/core/password/generator.ts` — no
new vault format, no new crypto code path. The recovery secret is an
8-word Diceware passphrase (`generatePassphrase({words: 8,
includeNumber: true})`), shown once, downloadable as a `.svault` file that
opens with `openVault()` like any other vault — because structurally, it
*is* just another vault, encrypted under a different key.

Option (1) was rejected primarily because of what it demands stay resident
in memory: a live multi-key vault means the recovery-key-wrapped copy of
the data-encryption key has to be kept valid and re-wrapped on every write,
which means the recovery key's derived wrapping key (or the raw
data-encryption key it protects) has to be available whenever the vault is
saved — a second permanently-derivable secret sitting alongside the master
password's, expanding the attack surface for comparatively little gain over
"generate a fresh snapshot when you set this up, and again if you want it
current."

## Consequences

- **The recovery snapshot goes stale.** It reflects the vault at the moment
  it was generated — entries added afterward aren't in it. This is
  explicit, not hidden: the modal doesn't claim otherwise, and there's no
  "keep this updated" background job (which would reintroduce the
  permanently-resident-second-key problem option (1) was rejected to
  avoid). Regenerating is a manual, deliberate action, same as the
  snapshot's original creation.
- **The recovery passphrase must be stored somewhere durable and separate**
  from the device holding the vault (this is inherent to any recovery
  scheme, not specific to the snapshot approach, but worth stating: a
  recovery key stored next to the thing it recovers protects against
  nothing).
- Zero new crypto surface: `openVault()`/`createVault()` didn't change to
  support this. The regression test in
  `src/core/vault/serializer.test.ts` ("a snapshot encrypted under a
  separate recovery key opens with that key but not the original master
  password") is really just confirming two independent `createVault()`
  calls over the same entry data produce independently-keyed payloads,
  which was already true by construction.
