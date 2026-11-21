/**
 * @file src/types/electron-bridge.d.ts
 * Ambient type for the contextBridge API exposed by src/electron/preload.ts.
 * `window.electron` only exists in the Electron desktop build — every call
 * site must guard with `"electron" in window` (see src/main.tsx's PWA
 * registration for the same pattern used the other direction) or
 * `window.electron?.` before touching it, exactly like `chrome.runtime` is
 * guarded for the browser-extension bridge (invariant #9 in CLAUDE.md).
 */
export type UpdateStatus =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

export interface ElectronBridge {
  platform: string;
  version: string;
  /** Browser-extension bridge transport (ADR 0007). */
  bridge?: {
    onFrame: (cb: (f: { connId: number; origin: string; msg: unknown }) => void) => () => void;
    onClosed: (cb: (connId: number) => void) => () => void;
    send: (connId: number, msg: object) => Promise<boolean>;
    close: (connId: number) => Promise<void>;
    installHost: (extensionIds: string[]) => Promise<{ manifest: string; registered: number }>;
  };
  /** Present from M5: SSH agent served from the app. */
  sshAgent?: {
    /** Returns the agent socket/pipe path when running, else null. */
    setEnabled: (on: boolean) => Promise<string | null>;
    onRequest: (
      cb: (r: {
        id: number;
        req: { kind: "list" } | { kind: "sign"; keyBlob: string; data: string; flags: number };
      }) => void,
    ) => () => void;
    reply: (id: number, value: unknown) => Promise<void>;
  };
  /** Present from M4: secret copies kept out of clipboard history. */
  clipboard?: {
    writeSecret: (text: string) => Promise<{ ok: boolean; excluded: boolean }>;
    clearSecret: () => Promise<boolean>;
  };
  /** Present from M4: remember this device (OS keystore). */
  deviceUnlock?: {
    status: () => Promise<
      | { supported: false }
      | { supported: true; enrolled: false }
      | {
          supported: true;
          enrolled: true;
          salt: string;
          expiresAt: number;
          protection: "hello" | "touchid" | "account";
        }
    >;
    save: (salt: string, rawB64: string) => Promise<boolean>;
    refresh: (salt: string) => Promise<boolean>;
    load: (salt: string) => Promise<string | null>;
    clear: () => Promise<void>;
  };
  /** Present in builds with the custom title bar / Quick Access (M2+). */
  window?: {
    setTitleBarTheme: (colors: { color: string; symbolColor: string }) => Promise<void>;
    onQuickAccess: (callback: () => void) => () => void;
    /** Present from M4: sleep / screen lock / user switch. */
    onSystemLock?: (callback: () => void) => () => void;
  };
  updates: {
    check: () => Promise<void>;
    download: () => Promise<void>;
    quitAndInstall: () => Promise<void>;
    onStatus: (callback: (status: UpdateStatus) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}
