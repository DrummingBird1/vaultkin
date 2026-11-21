/**
 * @file src/store/totp.store.ts
 * Live TOTP codes for the Authenticator page. Recomputes every second.
 */
import { create } from "zustand";
import { generateTOTP, type Algorithm } from "../core/totp/totp";

interface TOTPCode {
  entryId: string;
  code: string;
  remaining: number;
  period: number;
}

interface TOTPState {
  codes: Map<string, TOTPCode>;
  refresh: (
    entries: Array<{
      id: string;
      totpSecret?: string;
      totpAlgorithm?: Algorithm;
      totpDigits?: 6 | 8;
      totpPeriod?: number;
    }>,
  ) => Promise<void>;
  clear: () => void;
}

export const useTOTPStore = create<TOTPState>((set) => ({
  codes: new Map(),

  refresh: async (entries) => {
    const out = new Map<string, TOTPCode>();
    for (const e of entries) {
      if (!e.totpSecret) continue;
      try {
        const r = await generateTOTP(e.totpSecret, {
          algorithm: e.totpAlgorithm,
          digits: e.totpDigits,
          period: e.totpPeriod,
        });
        out.set(e.id, { entryId: e.id, ...r });
      } catch {
        /* invalid secret — skip */
      }
    }
    set({ codes: out });
  },

  clear: () => set({ codes: new Map() }),
}));
