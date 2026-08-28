/**
 * @file src/core/vault/serializer.fuzz.test.ts
 * Property-based fuzzing of openVault() against malformed payloads. The
 * invariant under test: openVault() must NEVER leak a raw, untyped error
 * (DOMException from atob(), a bare Error from hash-wasm, a SyntaxError
 * from JSON.parse, ...) — every failure mode has to surface as
 * VaultCorruptError or WrongPasswordError so callers filtering by
 * `instanceof` never see something fall through. This is exactly the class
 * of bug the field-validation block in serializer.ts's openVault() was
 * added to close — see the comments there for the specific cases found
 * this way (missing/garbage base64 fields, an under-length salt).
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createVault, openVault } from "./serializer";
import { VaultCorruptError, WrongPasswordError } from "../errors";
import { createDefaultVaultData } from "./vault-types";

const PASSWORD = "correct-horse-battery-staple-77!";

/** A valid, freshly-created payload to mutate per fuzz iteration. */
async function validPayload(): Promise<Record<string, unknown>> {
  const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
  return JSON.parse(encryptedPayload);
}

async function expectTypedFailure(mutated: unknown): Promise<void> {
  try {
    await openVault(JSON.stringify(mutated), PASSWORD);
    // Some mutations (e.g. touching an unrelated/absent key) may leave the
    // payload valid enough to open successfully — that's fine, not every
    // mutation has to fail.
  } catch (err) {
    expect(err instanceof VaultCorruptError || err instanceof WrongPasswordError).toBe(true);
  }
}

describe("openVault fuzzing — arbitrary field corruption", () => {
  it("never throws an untyped error when a base64 field is replaced with garbage strings", async () => {
    const base = await validPayload();
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("salt", "iv", "data", "mac"),
        fc.string(),
        async (field, garbage) => {
          await expectTypedFailure({ ...base, [field]: garbage });
        },
      ),
      { numRuns: 50 },
    );
  });

  it("never throws an untyped error when a base64 field is a non-string value", async () => {
    const base = await validPayload();
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("salt", "iv", "data", "mac"),
        fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.integer())),
        async (field, value) => {
          await expectTypedFailure({ ...base, [field]: value });
        },
      ),
      { numRuns: 50 },
    );
  });

  it("never throws an untyped error for an arbitrary kdf.iterations value", async () => {
    const base = await validPayload();
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.double(), fc.string(), fc.constant(null), fc.constant(undefined)),
        async (iterations) => {
          const mutated = { ...base, kdf: { ...(base.kdf as object), iterations } };
          await expectTypedFailure(mutated);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("never throws an untyped error for an arbitrary kdf.name value", async () => {
    const base = await validPayload();
    await fc.assert(
      fc.asyncProperty(fc.string(), async (name) => {
        const mutated = { ...base, kdf: { ...(base.kdf as object), name } };
        await expectTypedFailure(mutated);
      }),
      { numRuns: 50 },
    );
  });

  it("never throws an untyped error for arbitrary top-level JSON structures", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (arbitrary) => {
        await expectTypedFailure(arbitrary);
      }),
      { numRuns: 100 },
    );
  });

  it("never throws an untyped error for a valid-shaped payload with a short salt", async () => {
    const base = await validPayload();
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 7 }), async (shortSaltBytes) => {
        const shortSalt = Buffer.from(shortSaltBytes).toString("base64");
        await expectTypedFailure({ ...base, salt: shortSalt });
      }),
      { numRuns: 30 },
    );
  });

  it("rejects raw non-JSON strings as VaultCorruptError", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (raw) => {
        try {
          JSON.parse(raw);
          return; // valid JSON by accident — not the case under test
        } catch {
          /* fall through — this is the non-JSON case we want */
        }
        await expect(openVault(raw, PASSWORD)).rejects.toThrow(VaultCorruptError);
      }),
      { numRuns: 50 },
    );
  });
});
