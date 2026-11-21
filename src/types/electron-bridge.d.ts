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
