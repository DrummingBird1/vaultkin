import { describe, it, expect } from "vitest";
import {
  FLAG_AT,
  FLAG_BE,
  FLAG_BS,
  FLAG_UP,
  FLAG_UV,
  b64u,
  cbor,
  createPasskey,
  fromB64u,
  rawToDer,
  rpIdAllowed,
  signAssertion,
} from "./authenticator";
import { registrableDomain } from "../vault/grouping";

// ── tiny CBOR decoder for verification only ────────────────────────────────
function decode(b: Uint8Array, o = 0): [unknown, number] {
  const ib = b[o++];
  const major = ib >> 5;
  let n = ib & 31;
  if (n === 24) {
    n = b[o++];
  } else if (n === 25) {
    n = (b[o] << 8) | b[o + 1];
    o += 2;
  } else if (n === 26) {
    n = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    o += 4;
  }
  if (major === 0) return [n, o];
  if (major === 1) return [-1 - n, o];
  if (major === 2) return [b.slice(o, o + n), o + n];
  if (major === 3) return [new TextDecoder().decode(b.slice(o, o + n)), o + n];
  if (major === 5) {
    const m = new Map<unknown, unknown>();
    for (let i = 0; i < n; i++) {
      const [k, o1] = decode(b, o);
      const [v, o2] = decode(b, o1);
      m.set(k, v);
      o = o2;
    }
    return [m, o];
  }
  throw new Error(`major ${major}`);
}

function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(64);
  let o = 2;
  for (const off of [0, 32]) {
    const len = der[o + 1];
    let v = der.slice(o + 2, o + 2 + len);
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    out.set(v, off + 32 - v.length);
    o += 2 + len;
  }
  return out;
}

const sha256 = async (d: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", d));
const clientData = (type: string) =>
  new TextEncoder().encode(
    JSON.stringify({
      type,
      challenge: "Y2hhbGxlbmdl",
      origin: "https://login.example.com",
      crossOrigin: false,
    }),
  );

describe("CBOR", () => {
  it("encodes the WebAuthn subset canonically", () => {
    expect([...cbor(0)]).toEqual([0x00]);
    expect([...cbor(-7)]).toEqual([0x26]);
    expect([...cbor(500)]).toEqual([0x19, 0x01, 0xf4]);
    expect([...cbor("fmt")]).toEqual([0x63, 0x66, 0x6d, 0x74]);
    expect([...cbor(new Uint8Array([1, 2]))]).toEqual([0x42, 1, 2]);
    expect(decode(cbor({ fmt: "none", attStmt: {} }))[0]).toEqual(
      new Map<unknown, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
      ]),
    );
  });
});

describe("software authenticator", () => {
  it("create(): attestation none with a well-formed authData and COSE key", async () => {
    const r = await createPasskey({
      rpId: "example.com",
      userHandle: b64u(new Uint8Array([7, 7])),
      userName: "octo",
      userVerified: true,
    });
    const att = decode(fromB64u(r.attestationObject))[0] as Map<string, unknown>;
    expect(att.get("fmt")).toBe("none");
    const authData = att.get("authData") as Uint8Array;
    expect(b64u(authData)).toBe(r.authenticatorData);
    expect([...authData.slice(0, 32)]).toEqual([
      ...(await sha256(new TextEncoder().encode("example.com"))),
    ]);
    expect(authData[32]).toBe(FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS | FLAG_AT);
    expect([...authData.slice(33, 37)]).toEqual([0, 0, 0, 0]); // signCount
    expect([...authData.slice(37, 53)]).toEqual(new Array(16).fill(0)); // AAGUID
    const idLen = (authData[53] << 8) | authData[54];
    expect(b64u(authData.slice(55, 55 + idLen))).toBe(r.passkey.credentialId);
    const cose = decode(authData.slice(55 + idLen))[0] as Map<number, unknown>;
    expect([cose.get(1), cose.get(3), cose.get(-1)]).toEqual([2, -7, 1]);
    expect((cose.get(-2) as Uint8Array).length).toBe(32);
    expect(r.passkey.publicKeyCose).toBe(b64u(authData.slice(55 + idLen)));
  });

  it("get(): the signature verifies with the registered public key, and only for that data", async () => {
    const { passkey, publicKeySpki } = await createPasskey({
      rpId: "example.com",
      userHandle: "dXNlcg",
      userName: "u",
      userVerified: true,
    });
    const cd = clientData("webauthn.get");
    const a = await signAssertion(passkey, cd, true);
    const authData = fromB64u(a.authenticatorData);
    expect(authData[32]).toBe(FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS);
    expect(authData.length).toBe(37);

    const pub = await crypto.subtle.importKey(
      "spki",
      fromB64u(publicKeySpki),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const signed = new Uint8Array([...authData, ...(await sha256(cd))]);
    const sig = derToRaw(fromB64u(a.signature));
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, signed)).toBe(
      true,
    );
    const other = new Uint8Array([...authData, ...(await sha256(clientData("webauthn.create")))]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, other)).toBe(
      false,
    );
    expect(a.userHandle).toBe("dXNlcg");
  });

  it("DER encoding handles high-bit and leading-zero integers", () => {
    const raw = new Uint8Array(64);
    raw[0] = 0x80; // r needs a 0x00 pad
    raw[63] = 0x01; // s is tiny: leading zeros stripped
    const der = rawToDer(raw);
    expect(der[0]).toBe(0x30);
    expect([...der.slice(2, 5)]).toEqual([0x02, 33, 0x00]);
    expect([...der.slice(-3)]).toEqual([0x02, 1, 0x01]);
    expect(derToRaw(der)).toEqual(raw);
  });
});

describe("rpIdAllowed", () => {
  const isSuffix = (d: string) => registrableDomain(`x.${d}`) === `x.${d}`;
  it.each([
    ["example.com", "https://example.com", true],
    ["example.com", "https://login.example.com", true],
    ["login.example.com", "https://login.example.com:8443", true],
    ["example.com", "https://example.com.evil.net", false],
    ["other.com", "https://example.com", false],
    ["com", "https://example.com", false], // public suffix
    ["co.uk", "https://bbc.co.uk", false],
    ["example.com", "http://example.com", false], // not https
    ["localhost", "http://localhost:3000", true],
    ["example.com", "not a url", false],
  ])("rpId %s on %s → %s", (rpId, origin, ok) => {
    expect(rpIdAllowed(rpId, origin, isSuffix)).toBe(ok);
  });
});
