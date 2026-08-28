/**
 * @file src/core/errors.ts
 * Typed errors thrown by engine.ts/serializer.ts. Callers catch these with
 * `instanceof`, not by matching `err.message` substrings — message text can
 * change without notice, the error's type shouldn't.
 */

export class WrongPasswordError extends Error {
  constructor(message = "Incorrect master password.") {
    super(message);
    this.name = "WrongPasswordError";
  }
}

export class VaultCorruptError extends Error {
  constructor(message = "Vault data is corrupted.") {
    super(message);
    this.name = "VaultCorruptError";
  }
}

export class DuressTriggeredError extends Error {
  constructor(message = "Duress password entered.") {
    super(message);
    this.name = "DuressTriggeredError";
  }
}
