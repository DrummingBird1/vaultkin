/**
 * @file src/electron/main.ts
 * Electron main process. Minimal: hardened BrowserWindow loads either the
 * Vite dev server (development) or the built bundle (production).
 */
import {
  app,
  BrowserWindow,
  Menu,
  shell,
  crashReporter,
  ipcMain,
  globalShortcut,
  powerMonitor,
  session,
  clipboard,
  dialog,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { mainLog } from "./logger";
import { wireUpdater, checkForUpdates, downloadUpdate, quitAndInstall } from "./update.service";
import { bridgeSocketPath, startBridgeServer } from "./bridge-transport";
import { installNativeHost } from "./bridge-install";
import * as deviceUnlock from "./device-unlock";
import * as folderSync from "./folder-sync";
import { writeSecretExcludedFromHistory } from "./secure-clipboard";
import { createHash } from "crypto";
import { startSshAgent, sshAgentPath, type AgentRequest, type AgentIdentity } from "./ssh-agent";
import { APP_ORIGIN, APP_URL, handleAppProtocol, registerAppScheme } from "./app-protocol";

const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;

// Renamed from SecureVault: keep using the old data folder if it exists, so an
// existing vault, device-unlock key and settings are not orphaned. Must run
// before anything reads userData (logger, crashReporter, IndexedDB).
{
  const appData = app.getPath("appData");
  const legacy = ["SecureVault", "securevault"]
    .map((n) => path.join(appData, n))
    .find((p) => fs.existsSync(p));
  if (legacy && !fs.existsSync(app.getPath("userData"))) app.setPath("userData", legacy);
}

// Production renderer is served from app://securevault (see app-protocol.ts).
registerAppScheme();

// Local-only crash capture — uploadToServer: false means dumps are written
// to app.getPath("crashDumps") and NEVER transmitted anywhere. This is not
// telemetry (invariant #1 in CLAUDE.md: no telemetry, ever); it exists so a
// user who hits a native crash has something concrete to attach when
// reporting it themselves, the same way mainLog exists for JS-level errors.
crashReporter.start({
  productName: "Vaultkin",
  companyName: "Vaultkin",
  uploadToServer: false,
  compress: true,
});

process.on("uncaughtException", (err) => {
  mainLog.error("uncaughtException", { message: err.message, stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  mainLog.error("unhandledRejection", {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

/** Height of the custom title bar; the renderer reserves the same space. */
const TITLEBAR_HEIGHT = 44;
/** Global hotkey: bring Vaultkin forward and open the command palette. */
const QUICK_ACCESS_ACCELERATOR = "CommandOrControl+Shift+Space";

let mainWindow: BrowserWindow | null = null;

const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
/** URLs the window may show: the built bundle, or the dev server in dev. */
function isAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!isDev) return u.origin === APP_ORIGIN;
    return u.origin === new URL(DEV_URL).origin;
  } catch {
    return false;
  }
}

/** Deny every permission request (camera, mic, notifications, geolocation,
 *  HID, serial, ...). Clipboard writes from a user gesture don't need one. */
function lockDownSession(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    mainLog.warn("denied permission", { permission });
    callback(false);
  });
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
}

/** Lock the vault when the machine sleeps or the OS session is locked. */
function wireSystemLock(): void {
  const lock = (why: string) => {
    mainLog.info("system lock", { why });
    mainWindow?.webContents.send("sv-system-lock");
  };
  powerMonitor.on("suspend", () => lock("suspend"));
  powerMonitor.on("lock-screen", () => lock("lock-screen"));
  // macOS fast user switching.
  powerMonitor.on("user-did-resign-active", () => lock("user-switch"));
}

function createWindow(): void {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0D0D12",
    title: "Vaultkin",
    autoHideMenuBar: true,
    // Frameless look with native window controls: on Windows/Linux the
    // minimize/maximize/close buttons are drawn by the OS over our top bar
    // (colors follow the app theme via sv-set-titlebar-theme); on macOS the
    // traffic lights sit inset in the sidebar header.
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    ...(isMac
      ? { trafficLightPosition: { x: 16, y: 15 } }
      : { titleBarOverlay: { color: "#15151b", symbolColor: "#b5b5be", height: TITLEBAR_HEIGHT } }),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Disable menu in production (keeps DevTools available via Ctrl+Shift+I)
  if (!isDev) Menu.setApplicationMenu(null);

  // External links open in the user's default browser (http/https only),
  // never inside Electron.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  // The window never navigates away from the app itself, and never hosts a
  // <webview>.
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      mainLog.warn("blocked navigation", { scheme: url.split(":")[0] });
    }
  });
  win.webContents.on("will-redirect", (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  // Keep vault contents out of screenshots, screen sharing and recording
  // (Windows/macOS). SV_ALLOW_CAPTURE=1 turns it off for dev screenshots.
  if (!process.env.SV_ALLOW_CAPTURE) win.setContentProtection(true);

  win.webContents.on("render-process-gone", (_event, details) => {
    mainLog.error("render-process-gone", { reason: details.reason, exitCode: details.exitCode });
  });

  wireUpdater(win);
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (isDev) {
    win.loadURL(DEV_URL);
    // Dev-only visual check: SV_CAPTURE=<file.png> saves a screenshot of the
    // window 2 s after load, then quits. Ignored in packaged builds.
    const capture = process.env.SV_CAPTURE;
    if (capture) {
      win.webContents.once("did-finish-load", () => {
        setTimeout(async () => {
          const img = await win.webContents.capturePage();
          await import("fs").then((fs) => fs.promises.writeFile(capture, img.toPNG()));
          mainLog.info("captured", { file: capture, size: img.getSize() });
          app.quit();
        }, 2000);
      });
    } else if (!process.env.SV_NO_DEVTOOLS) {
      win.webContents.openDevTools({ mode: "right" });
    }
  } else {
    win.loadURL(APP_URL);
  }
}

function startApp(): void {
  // Renderer-invoked only (see update.service.ts's header comment) — nothing
  // here runs unless Settings' "Check for updates" button calls it first.
  ipcMain.handle("sv-check-for-updates", () => checkForUpdates());
  ipcMain.handle("sv-download-update", () => downloadUpdate());
  ipcMain.handle("sv-quit-and-install", () => quitAndInstall());

  // Title-bar overlay colors follow the renderer's theme. Input is validated:
  // only two #rrggbb strings are accepted, anything else is ignored.
  const HEX = /^#[0-9a-fA-F]{6}$/;
  ipcMain.handle("sv-set-titlebar-theme", (event, colors: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || process.platform === "darwin") return;
    const c = colors as { color?: unknown; symbolColor?: unknown } | null;
    if (!c || typeof c.color !== "string" || typeof c.symbolColor !== "string") return;
    if (!HEX.test(c.color) || !HEX.test(c.symbolColor)) return;
    try {
      win.setTitleBarOverlay({
        color: c.color,
        symbolColor: c.symbolColor,
        height: TITLEBAR_HEIGHT,
      });
    } catch (err) {
      mainLog.warn("setTitleBarOverlay failed", { message: (err as Error).message });
    }
  });

  /** Quick Access: show + focus the window and ask the renderer to open the palette.
   *  The vault (and its keys) stay in this one renderer; nothing is copied to a
   *  second window. If the vault is locked, the user lands on the unlock screen. */
  function quickAccess(): void {
    if (!mainWindow) createWindow();
    const win = mainWindow;
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send("sv-quick-access");
  }

  // ── Extension bridge (ADR 0007) ────────────────────────────────────────
  // Frames go to/from the renderer untouched; after pairing they are sealed
  // end to end, so this process never sees vault data.
  let bridge: ReturnType<typeof startBridgeServer> | null = null;
  const fromMainWindow = (event: Electron.IpcMainInvokeEvent) =>
    !!mainWindow && event.sender === mainWindow.webContents;
  ipcMain.handle("sv-bridge-send", (event, connId: unknown, msg: unknown) => {
    if (!fromMainWindow(event)) return false;
    if (typeof connId !== "number" || !Number.isInteger(connId)) return false;
    if (typeof msg !== "object" || msg === null) return false;
    return bridge?.send(connId, msg) ?? false;
  });
  ipcMain.handle("sv-bridge-close", (event, connId: unknown) => {
    if (!fromMainWindow(event) || typeof connId !== "number") return;
    bridge?.close(connId);
  });
  ipcMain.handle("sv-bridge-install", async (event, ids: unknown) => {
    if (!fromMainWindow(event)) throw new Error("Not allowed");
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string"))
      throw new Error("Bad input");
    return installNativeHost(ids as string[]);
  });

  // ── SSH agent (opt-in; keys + approval live in the renderer) ──────────
  let sshAgent: { stop(): void } | null = null;
  let nextAgentReq = 1;
  const agentPending = new Map<number, (v: unknown) => void>();
  const askRenderer = (req: AgentRequest, timeoutMs: number) =>
    new Promise<unknown>((resolve) => {
      const win = mainWindow;
      if (!win) return resolve(null);
      const id = nextAgentReq++;
      const timer = setTimeout(() => {
        agentPending.delete(id);
        resolve(null);
      }, timeoutMs);
      agentPending.set(id, (v) => {
        clearTimeout(timer);
        agentPending.delete(id);
        resolve(v);
      });
      if (req.kind === "sign") {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
      win.webContents.send("sv-ssh-agent-request", { id, req });
    });
  ipcMain.handle("sv-ssh-agent-reply", (event, id: unknown, value: unknown) => {
    if (!fromMainWindow(event) || typeof id !== "number") return;
    agentPending.get(id)?.(value);
  });
  ipcMain.handle("sv-ssh-agent-enable", (event, on: unknown) => {
    if (!fromMainWindow(event)) return null;
    if (on === true && !sshAgent) {
      try {
        sshAgent = startSshAgent(
          sshAgentPath(),
          {
            list: async () => {
              const r = await askRenderer({ kind: "list" }, 10_000);
              return Array.isArray(r)
                ? r.filter(
                    (i): i is AgentIdentity =>
                      typeof i?.blob === "string" && typeof i?.comment === "string",
                  )
                : [];
            },
            sign: async (req) => {
              const r = await askRenderer(req, 120_000);
              return typeof r === "string" ? r : null;
            },
          },
          (err) => {
            mainLog.warn("ssh agent error", { message: err.message });
            sshAgent?.stop();
            sshAgent = null;
          },
        );
      } catch (err) {
        mainLog.warn("ssh agent failed to start", { message: (err as Error).message });
        return null;
      }
    } else if (on === false && sshAgent) {
      sshAgent.stop();
      sshAgent = null;
    }
    return sshAgent ? sshAgentPath() : null;
  });

  // ── Folder sync (encrypted copy in a user-chosen folder) ──────────────
  ipcMain.handle("sv-folder-sync-status", (event) =>
    fromMainWindow(event) ? folderSync.status() : null,
  );
  ipcMain.handle("sv-folder-sync-choose", async (event) => {
    if (!fromMainWindow(event) || !mainWindow) return null;
    // Tests (unpackaged only) can't drive the native dialog.
    let dir = !app.isPackaged ? process.env.SV_FOLDER_SYNC_DIR : undefined;
    if (!dir) {
      const r = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory", "createDirectory"],
      });
      if (r.canceled || !r.filePaths[0]) return folderSync.status();
      dir = r.filePaths[0];
    }
    folderSync.setDir(dir);
    return folderSync.status();
  });
  ipcMain.handle("sv-folder-sync-clear", (event) => {
    if (fromMainWindow(event)) folderSync.setDir(null);
  });
  ipcMain.handle("sv-folder-sync-read", (event) =>
    fromMainWindow(event) ? folderSync.read() : null,
  );
  ipcMain.handle("sv-folder-sync-write", (event, payload: unknown, force: unknown) =>
    fromMainWindow(event) && typeof payload === "string"
      ? folderSync.write(payload, force === true)
      : "error",
  );

  // ── Secret clipboard ───────────────────────────────────────────────────
  // Copies of secrets skip Windows Clipboard History / cloud clipboard, and the
  // auto-clear only wipes the clipboard if it still holds what we put there.
  let lastSecretHash: string | null = null;
  const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
  ipcMain.handle("sv-clipboard-write-secret", async (event, text: unknown) => {
    if (!fromMainWindow(event) || typeof text !== "string" || text.length > 100_000)
      return { ok: false, excluded: false };
    const excluded = await writeSecretExcludedFromHistory(text);
    if (!excluded) clipboard.writeText(text);
    lastSecretHash = sha(text);
    return { ok: true, excluded };
  });
  ipcMain.handle("sv-clipboard-clear-secret", (event) => {
    if (!fromMainWindow(event) || !lastSecretHash) return false;
    const mine = sha(clipboard.readText()) === lastSecretHash;
    lastSecretHash = null;
    if (mine) clipboard.clear();
    return mine;
  });

  // ── Remember this device (OS keystore) ────────────────────────────────
  const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
  const isSalt = (x: unknown): x is string =>
    typeof x === "string" && x.length <= 64 && B64.test(x);
  ipcMain.handle("sv-device-unlock-status", (event) =>
    fromMainWindow(event) ? deviceUnlock.status() : { supported: false },
  );
  ipcMain.handle("sv-device-unlock-save", (event, salt: unknown, raw: unknown) => {
    if (!fromMainWindow(event) || !isSalt(salt)) return false;
    // 64 bytes → 88 base64 chars.
    if (typeof raw !== "string" || raw.length !== 88 || !B64.test(raw)) return false;
    return deviceUnlock.save(salt, raw);
  });
  ipcMain.handle("sv-device-unlock-refresh", (event, salt: unknown) =>
    fromMainWindow(event) && isSalt(salt) ? deviceUnlock.refresh(salt) : false,
  );
  ipcMain.handle("sv-device-unlock-load", (event, salt: unknown) =>
    fromMainWindow(event) && isSalt(salt) ? deviceUnlock.load(salt) : null,
  );
  ipcMain.handle("sv-device-unlock-clear", (event) => {
    if (fromMainWindow(event)) deviceUnlock.clear();
  });

  app.whenReady().then(() => {
    mainLog.info("app ready", {
      version: app.getVersion(),
      electron: process.versions.electron,
      logFile: mainLog.filePath(),
    });
    lockDownSession();
    if (!isDev) handleAppProtocol(path.join(__dirname, "../renderer"));
    wireSystemLock();
    createWindow();
    try {
      bridge = startBridgeServer(bridgeSocketPath(), {
        onFrame: (connId, origin, msg) =>
          mainWindow?.webContents.send("sv-bridge-frame", { connId, origin, msg }),
        onClose: (connId) => mainWindow?.webContents.send("sv-bridge-closed", { connId }),
      });
    } catch (err) {
      mainLog.warn("bridge server failed to start", { message: (err as Error).message });
    }
    const ok = globalShortcut.register(QUICK_ACCESS_ACCELERATOR, quickAccess);
    mainLog.info("quick access hotkey", { accelerator: QUICK_ACCESS_ACCELERATOR, registered: ok });
  });
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    bridge?.stop();
    sshAgent?.stop();
  });
  app.on("window-all-closed", () => {
    mainLog.info("window-all-closed");
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

startApp();
