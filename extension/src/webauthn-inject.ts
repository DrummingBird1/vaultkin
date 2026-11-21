/**
 * Runs in the PAGE's JavaScript world (manifest "world": "MAIN"). Offers
 * Vaultkin as a passkey provider: navigator.credentials.create()/get()
 * with a `publicKey` request are forwarded (via the isolated content script
 * and the background worker) to the desktop app, which asks the user and does
 * the cryptography. If Vaultkin can't handle it — app not connected, no
 * passkey for this site, user chose Cancel, unsupported algorithm,
 * conditional mediation — the browser's own implementation runs unchanged.
 *
 * This script never sees vault data other than the result the page itself
 * would receive.
 */
(() => {
  const creds = navigator.credentials;
  if (!creds || (window as unknown as { __svPasskeys?: boolean }).__svPasskeys) return;
  (window as unknown as { __svPasskeys?: boolean }).__svPasskeys = true;
  const native = { create: creds.create.bind(creds), get: creds.get.bind(creds) };

  const toB64u = (src: BufferSource): string => {
    const bytes =
      src instanceof ArrayBuffer
        ? new Uint8Array(src)
        : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fromB64u = (s: string): ArrayBuffer => {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  };

  let seq = 0;
  function ask(
    kind: "create" | "get",
    options: Record<string, unknown>,
  ): Promise<Record<string, string> | null> {
    const id = `${Date.now()}-${++seq}`;
    return new Promise((resolve) => {
      const onMsg = (ev: MessageEvent) => {
        if (ev.source !== window || ev.data?.__sv !== "passkey-res" || ev.data.id !== id) return;
        window.removeEventListener("message", onMsg);
        resolve(ev.data.result ?? null);
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ __sv: "passkey-req", id, kind, options }, window.location.origin);
      // Generous: the user confirms in the app.
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve(null);
      }, 120_000);
    });
  }

  function credential(
    rawIdB64: string,
    response: object,
    attachment = "platform",
  ): PublicKeyCredential {
    const rawId = fromB64u(rawIdB64);
    const c = Object.create(PublicKeyCredential.prototype);
    Object.defineProperties(c, {
      id: { value: rawIdB64, enumerable: true },
      rawId: { value: rawId, enumerable: true },
      type: { value: "public-key", enumerable: true },
      authenticatorAttachment: { value: attachment, enumerable: true },
      response: { value: response, enumerable: true },
      getClientExtensionResults: { value: () => ({}) },
      toJSON: {
        value: () => ({
          id: rawIdB64,
          rawId: rawIdB64,
          type: "public-key",
          authenticatorAttachment: attachment,
          clientExtensionResults: {},
          response: (response as { toJSON: () => unknown }).toJSON(),
        }),
      },
    });
    return c;
  }

  creds.create = async function (options?: CredentialCreationOptions) {
    const pk = options?.publicKey;
    if (!pk || !pk.pubKeyCredParams?.some((p) => p.alg === -7)) return native.create(options);
    const r = await ask("create", {
      challenge: toB64u(pk.challenge),
      rpId: pk.rp.id ?? location.hostname,
      user: { id: toB64u(pk.user.id), name: pk.user.name, displayName: pk.user.displayName },
      exclude: (pk.excludeCredentials ?? []).map((c) => toB64u(c.id)),
    });
    if (!r) return native.create(options);
    if (r.error === "excluded")
      throw new DOMException("A passkey for this account already exists.", "InvalidStateError");
    const response = Object.create(AuthenticatorAttestationResponse.prototype);
    const clientDataJSON = fromB64u(r.clientDataJSON);
    const attestationObject = fromB64u(r.attestationObject);
    Object.defineProperties(response, {
      clientDataJSON: { value: clientDataJSON, enumerable: true },
      attestationObject: { value: attestationObject, enumerable: true },
      getTransports: { value: () => ["hybrid", "internal"] },
      getAuthenticatorData: { value: () => fromB64u(r.authenticatorData) },
      getPublicKey: { value: () => fromB64u(r.publicKeySpki) },
      getPublicKeyAlgorithm: { value: () => -7 },
      toJSON: {
        value: () => ({
          clientDataJSON: r.clientDataJSON,
          attestationObject: r.attestationObject,
          authenticatorData: r.authenticatorData,
          publicKey: r.publicKeySpki,
          publicKeyAlgorithm: -7,
          transports: ["hybrid", "internal"],
        }),
      },
    });
    return credential(r.credentialId, response);
  } as typeof creds.create;

  creds.get = async function (options?: CredentialRequestOptions) {
    const pk = options?.publicKey;
    // Conditional UI (autofill-style) and non-passkey requests stay native.
    if (!pk || options?.mediation === "conditional") return native.get(options);
    const r = await ask("get", {
      challenge: toB64u(pk.challenge),
      rpId: pk.rpId ?? location.hostname,
      allow: (pk.allowCredentials ?? []).map((c) => toB64u(c.id)),
    });
    if (!r) return native.get(options);
    const response = Object.create(AuthenticatorAssertionResponse.prototype);
    Object.defineProperties(response, {
      clientDataJSON: { value: fromB64u(r.clientDataJSON), enumerable: true },
      authenticatorData: { value: fromB64u(r.authenticatorData), enumerable: true },
      signature: { value: fromB64u(r.signature), enumerable: true },
      userHandle: { value: r.userHandle ? fromB64u(r.userHandle) : null, enumerable: true },
      toJSON: {
        value: () => ({
          clientDataJSON: r.clientDataJSON,
          authenticatorData: r.authenticatorData,
          signature: r.signature,
          userHandle: r.userHandle,
        }),
      },
    });
    return credential(r.credentialId, response);
  } as typeof creds.get;
})();
