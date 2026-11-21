/**
 * @file src/services/device-unlock.service.ts
 * "Remember this device" (desktop only). The vault's derived key is handed to
 * the main process, which keeps it encrypted by the OS keystore
 * (src/electron/device-unlock.ts). The master password itself is never
 * stored. The raw key exists in this process only for the moment it is
 * exported or imported, then is wiped.
 */
import {
  exportDeviceKey,
  openVault,
  openVaultWithDeviceKey,
  payloadSalt,
  type OpenVaultResult,
} from "../core/vault/serializer";
import { bytesToBase64, base64ToBytes } from "../core/crypto/encoding";
import { WrongPasswordError } from "../core/errors";

export type DeviceUnlockState =
  { kind: "unsupported" } | { kind: "off" } | { kind: "on"; expiresAt: number };

const api = () => (typeof window !== "undefined" ? window.electron?.deviceUnlock : undefined);

export const DeviceUnlockService = {
  /** State for the vault currently on disk. A key saved for an older master
   *  password (different salt) counts as "off". */
  async state(storedPayload: string | null): Promise<DeviceUnlockState> {
    const a = api();
    if (!a) return { kind: "unsupported" };
    const s = await a.status();
    if (!s.supported) return { kind: "unsupported" };
    if (!s.enrolled || !storedPayload) return { kind: "off" };
    try {
      return s.salt === payloadSalt(storedPayload)
        ? { kind: "on", expiresAt: s.expiresAt }
        : { kind: "off" };
    } catch {
      return { kind: "off" };
    }
  },

  /** Turn on: verifies the master password, then stores the key. */
  async enable(storedPayload: string, password: string): Promise<boolean> {
    const a = api();
    if (!a) return false;
    const raw = await exportDeviceKey(storedPayload, password);
    try {
      return await a.save(payloadSalt(storedPayload), bytesToBase64(raw));
    } finally {
      raw.fill(0);
    }
  },

  async disable(): Promise<void> {
    await api()?.clear();
  },

  /**
   * Master-password unlock. When this device is remembered, the stored key is
   * refreshed (restarting its 14-day window) using the same single KDF run.
   */
  async openWithPassword(
    storedPayload: string,
    password: string,
    onProgress?: (p: number) => void,
  ): Promise<OpenVaultResult> {
    const a = api();
    const st = await this.state(storedPayload);
    if (!a || st.kind !== "on") return openVault(storedPayload, password, onProgress);
    const raw = await exportDeviceKey(storedPayload, password, onProgress);
    await a.save(payloadSalt(storedPayload), bytesToBase64(raw));
    return openVaultWithDeviceKey(storedPayload, raw); // wipes raw
  },

  /** Unlock without the master password. Null when the user cancelled or the
   *  key is gone/expired; a key that no longer opens the vault is removed. */
  async openWithDevice(storedPayload: string): Promise<OpenVaultResult | null> {
    const a = api();
    if (!a) return null;
    const b64 = await a.load(payloadSalt(storedPayload));
    if (!b64) return null;
    const raw = base64ToBytes(b64);
    try {
      return await openVaultWithDeviceKey(storedPayload, raw as Uint8Array<ArrayBuffer>);
    } catch (err) {
      if (err instanceof WrongPasswordError) await a.clear();
      throw err;
    }
  },
};
