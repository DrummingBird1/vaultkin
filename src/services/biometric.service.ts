/**
 * @file src/services/biometric.service.ts
 * Platform-authenticator (TouchID / Windows Hello / Android) detection.
 *
 * STATUS — deliberate scope decision:
 * Full biometric *unlock* requires WebAuthn with the PRF extension to derive a
 * secret that wraps recoverable key material (the master password or the raw
 * KDF output), stored in IndexedDB. That is security-critical code that can only
 * be validated against a real platform authenticator with a user gesture — it
 * cannot run in CI/headless. Shipping it untested in a password manager would
 * risk either lock-out or exposure of wrapped master-key material, so the unlock
 * boundary remains the master password.
 *
 * What IS implemented here: accurate availability detection, so the UI only
 * offers biometrics when a platform authenticator genuinely exists, and a clear
 * message otherwise. The PRF enroll/unlock design is sketched in
 * docs/README.security.md for when it can be properly tested.
 */

export type BiometricStatus = "unavailable" | "available";

export const BiometricService = {
  /** True only if a platform (built-in) authenticator is present. */
  async getStatus(): Promise<BiometricStatus> {
    if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
      return "unavailable";
    }
    try {
      const fn = (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
      if (typeof fn !== "function") return "unavailable";
      const available = await fn.call((window as any).PublicKeyCredential);
      return available ? "available" : "unavailable";
    } catch {
      return "unavailable";
    }
  },

  /** Whether the WebAuthn PRF extension (needed for real unlock) is plausibly
   *  supported. Detection only — used to decide whether to surface the feature
   *  once the wrapped-key flow is implemented and tested. */
  async supportsPRF(): Promise<boolean> {
    // No reliable feature-detect short of an actual ceremony; report false so
    // nothing depends on an unverified capability yet.
    return false;
  },

  /**
   * Not implemented: returns null so callers fall back to the master password.
   * See file header for why the unlock boundary stays at the master password.
   */
  async authenticate(_prompt: string): Promise<ArrayBuffer | null> {
    return null;
  },
};
