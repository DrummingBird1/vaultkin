/**
 * @file src/electron/main.ts
 * Electron main process. Minimal: hardened BrowserWindow loads either the
 * Vite dev server (development) or the built bundle (production).
 */
import { app, BrowserWindow, Menu, shell, crashReporter, ipcMain, globalShortcut } from "electron";
import * as path from "path";
import { mainLog } from "./logger";
import { wireUpdater, checkForUpdates, downloadUpdate, quitAndInstall } from "./update.service";
import { bridgeSocketPath, startBridgeServer } from "./bridge-transport";
import { installNativeHost } from "./bridge-install";

const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;

// Local-only crash capture — uploadToServer: false means dumps are written
// to app.getPath("crashDumps") and NEVER transmitted anywhere. This is not
// telemetry (invariant #1 in CLAUDE.md: no telemetry, ever); it exists so a
// user who hits a native crash has something concrete to attach when
// reporting it themselves, the same way mainLog exists for JS-level errors.
crashReporter.start({
  productName: "SecureVault",
  companyName: "SecureVault",
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
/** Global hotkey: bring SecureVault forward and open the command palette. */
const QUICK_ACCESS_ACCELERATOR = "CommandOrControl+Shift+Space";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0D0D12",
    title: "SecureVault",
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

  // External links open in the user's default browser, not inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    mainLog.error("render-process-gone", { reason: details.reason, exitCode: details.exitCode });
  });

  wireUpdater(win);
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (isDev) {
    const url = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
    win.loadURL(url);
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
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
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

  app.whenReady().then(() => {
    mainLog.info("app ready", {
      version: app.getVersion(),
      electron: process.versions.electron,
      logFile: mainLog.filePath(),
    });
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
