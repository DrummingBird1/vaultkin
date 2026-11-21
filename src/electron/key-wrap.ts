/**
 * @file src/electron/key-wrap.ts
 * AES-256-GCM wrapping of the remembered device key under a secret derived
 * from a Windows Hello signature (see windows-hello.ts). Pure Node crypto.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/** 32-byte wrapping key = SHA-256(signature bytes). */
export const wrapKeyFromSignature = (signatureB64: string): Buffer =>
  createHash("sha256").update(Buffer.from(signatureB64, "base64")).digest();

/** base64(iv(12) || tag(16) || ciphertext) of the base64-encoded payload. */
export function wrap(payloadB64: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(payloadB64, "base64")), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

/** Inverse of wrap(); throws if the key is wrong or the data was altered. */
export function unwrap(wrappedB64: string, key: Buffer): string {
  const buf = Buffer.from(wrappedB64, "base64");
  if (buf.length < 29) throw new Error("wrapped key too short");
  const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("base64");
}
