/**
 * @file src/core/crypto/encoding.ts
 * Base64 / hex helpers used by the crypto layer.
 */

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export function utf8(str: string): Uint8Array<ArrayBuffer> {
  // TextEncoder returns Uint8Array<ArrayBufferLike>; the encoded bytes are
  // always backed by a plain ArrayBuffer, so this cast is safe and lets the
  // result satisfy BufferSource for crypto.subtle calls under TS 5.7+.
  return new TextEncoder().encode(str) as Uint8Array<ArrayBuffer>;
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Constant-time equality check on two byte arrays. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
