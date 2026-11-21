/**
 * @file src/core/totp/totp.ts
 * RFC 6238 TOTP / RFC 4226 HOTP. Uses Web Crypto for HMAC.
 */
import { base32Decode } from "./base32";

export type Algorithm = "SHA1" | "SHA256" | "SHA512";

export async function generateTOTP(
  secret: string,
  opts: { algorithm?: Algorithm; digits?: 6 | 8; period?: number; time?: number } = {},
): Promise<{ code: string; remaining: number; period: number }> {
  const algorithm = opts.algorithm ?? "SHA1";
  const digits = opts.digits ?? 6;
  const period = opts.period ?? 30;
  const time = opts.time ?? Date.now();

  const counter = Math.floor(time / 1000 / period);

  // Counter as 8-byte big-endian.
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setUint32(0, Math.floor(counter / 0x1_0000_0000));
  view.setUint32(4, counter & 0xffffffff);

  const keyBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: hashName(algorithm) },
    false,
    ["sign"],
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));

  // RFC 4226 dynamic truncation.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const mod = 10 ** digits;
  const code = (binCode % mod).toString().padStart(digits, "0");

  const elapsedInWindow = Math.floor(time / 1000) % period;
  const remaining = period - elapsedInWindow;

  return { code, remaining, period };
}

function hashName(a: Algorithm): "SHA-1" | "SHA-256" | "SHA-512" {
  if (a === "SHA256") return "SHA-256";
  if (a === "SHA512") return "SHA-512";
  return "SHA-1";
}
