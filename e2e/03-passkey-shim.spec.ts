/**
 * The passkey shim (extension/src/webauthn-inject.ts, built) in a real
 * Chromium page: what a website sees from navigator.credentials. The content
 * script relay is simulated in the page; the answers are produced by the same
 * authenticator code the app uses, so signatures are real.
 * Builds the extension first if dist/extension is missing.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import { createPasskey, signAssertion, b64u } from "../src/core/passkey/authenticator";

const SHIM = path.resolve(__dirname, "..", "dist", "extension", "src", "webauthn-inject.js");
const ORIGIN = "https://login.example.com";

// Playwright's Linux WebKit build ships without WebAuthn (no
// navigator.credentials), so there is nothing for the shim to wrap there.
test.skip(({ browserName }) => browserName === "webkit", "WebKit test build has no WebAuthn");

test.beforeAll(() => {
  if (!fs.existsSync(SHIM))
    execSync("node scripts/build-extension.mjs", { cwd: path.resolve(__dirname, "..") });
});

test("create() and get() return real PublicKeyCredential objects; null falls back to the browser", async ({
  page,
}) => {
  // Precompute app answers with the real authenticator.
  const created = await createPasskey({
    rpId: "example.com",
    userHandle: "dXNlcg",
    userName: "octo",
    userVerified: true,
  });
  const cdCreate = b64u(
    new TextEncoder().encode(
      JSON.stringify({
        type: "webauthn.create",
        challenge: "Y3JlYXRl",
        origin: ORIGIN,
        crossOrigin: false,
      }),
    ),
  );
  const cdGetBytes = new TextEncoder().encode(
    JSON.stringify({ type: "webauthn.get", challenge: "Z2V0", origin: ORIGIN, crossOrigin: false }),
  );
  const assertion = await signAssertion(created.passkey, cdGetBytes, true);
  const answers = {
    create: {
      ok: true,
      credentialId: created.passkey.credentialId,
      attestationObject: created.attestationObject,
      authenticatorData: created.authenticatorData,
      publicKeySpki: created.publicKeySpki,
      clientDataJSON: cdCreate,
    },
    get: { ok: true, ...assertion, clientDataJSON: b64u(cdGetBytes) },
  };

  await page.route(`${ORIGIN}/**`, (r) =>
    r.fulfill({ contentType: "text/html", body: "<!doctype html><title>rp</title>" }),
  );
  // The browser's own implementation, stubbed so we can tell when it's used.
  await page.addInitScript(() => {
    const c = navigator.credentials;
    c.create = async () => "native-create" as unknown as Credential;
    c.get = async () => "native-get" as unknown as Credential;
  });
  await page.addInitScript({ path: SHIM });
  // Simulated content-script relay: answers once per kind, then null.
  await page.addInitScript((a) => {
    const used = new Set<string>();
    window.addEventListener("message", (ev) => {
      if (ev.data?.__sv !== "passkey-req") return;
      (window as unknown as { __lastReq: unknown }).__lastReq = ev.data;
      const result = used.has(ev.data.kind) ? null : (a as Record<string, unknown>)[ev.data.kind];
      used.add(ev.data.kind);
      window.postMessage({ __sv: "passkey-res", id: ev.data.id, result }, location.origin);
    });
  }, answers);
  await page.goto(`${ORIGIN}/`);

  const res = await page.evaluate(async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const c = (await navigator.credentials.create({
      publicKey: {
        challenge: enc("create"),
        rp: { id: "example.com", name: "Example" },
        user: { id: enc("user"), name: "octo", displayName: "Octo" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      },
    })) as PublicKeyCredential;
    const req = (window as unknown as { __lastReq: { options: unknown } }).__lastReq;
    const att = c.response as AuthenticatorAttestationResponse;
    const g = (await navigator.credentials.get({
      publicKey: { challenge: enc("get"), rpId: "example.com" },
    })) as PublicKeyCredential;
    const asr = g.response as AuthenticatorAssertionResponse;
    const fallback = await navigator.credentials.get({ publicKey: { challenge: enc("again") } });
    const conditional = await navigator.credentials.get({
      mediation: "conditional",
      publicKey: { challenge: enc("c") },
    } as CredentialRequestOptions);
    const notPasskey = await navigator.credentials.create({
      password: { id: "x", password: "y" },
    } as unknown as CredentialCreationOptions);
    return {
      req,
      isPKC: c instanceof PublicKeyCredential,
      isAtt: att instanceof AuthenticatorAttestationResponse,
      type: c.type,
      idMatchesRaw:
        c.id ===
        btoa(String.fromCharCode(...new Uint8Array(c.rawId)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, ""),
      alg: att.getPublicKeyAlgorithm(),
      clientData: JSON.parse(new TextDecoder().decode(att.clientDataJSON)),
      json: JSON.parse(JSON.stringify(c)),
      ext: c.getClientExtensionResults(),
      getIsPKC: g instanceof PublicKeyCredential,
      isAsr: asr instanceof AuthenticatorAssertionResponse,
      sigLen: asr.signature.byteLength,
      userHandle: new TextDecoder().decode(asr.userHandle!),
      fallback,
      conditional,
      notPasskey,
    };
  });

  expect(res.req).toMatchObject({
    kind: "create",
    options: { rpId: "example.com", user: { name: "octo" } },
  });
  expect(res).toMatchObject({
    isPKC: true,
    isAtt: true,
    type: "public-key",
    idMatchesRaw: true,
    alg: -7,
    ext: {},
  });
  expect(res.clientData).toMatchObject({ type: "webauthn.create", origin: ORIGIN });
  expect(res.json).toMatchObject({ type: "public-key", response: { publicKeyAlgorithm: -7 } });
  expect(res).toMatchObject({ getIsPKC: true, isAsr: true, userHandle: "user" });
  expect(res.sigLen).toBeGreaterThan(64);
  expect(res.fallback).toBe("native-get"); // Vaultkin returned null → browser handles it
  expect(res.conditional).toBe("native-get"); // conditional mediation is never intercepted
  expect(res.notPasskey).toBe("native-create");
});
