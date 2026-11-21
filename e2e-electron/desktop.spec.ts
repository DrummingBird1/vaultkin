/**
 * Electron E2E: the real desktop window, hardened settings, custom title bar,
 * and the Quick Access hotkey path. Runs with a fresh, temporary profile so it
 * never touches the user's real SecureVault data.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "fs";
import { execFile, execFileSync, spawnSync } from "child_process";
import os from "os";
import path from "path";

const root = path.resolve(__dirname, "..");
const AGENT_SOCK =
  process.platform === "win32"
    ? `\\\\.\\pipe\\sv-e2e-ssh-agent-${process.pid}`
    : path.join(os.tmpdir(), `sv-e2e-ssh-agent-${process.pid}.sock`);
const SYNC_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sv-sync-"));
/** Windows' own OpenSSH speaks named pipes; Git's msys build doesn't. */
const OPENSSH_DIR = process.platform === "win32" ? "C:\\Windows\\System32\\OpenSSH\\" : "";
const MASTER = "correct-horse-battery-staple-77!";
const SHOTS = process.env.SV_SHOTS_DIR;

let app: ElectronApplication;
let win: Page;
let profile: string;

test.beforeAll(async () => {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "sv-e2e-"));
  app = await electron.launch({
    args: [root, `--user-data-dir=${profile}`],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: "http://localhost:5173",
      SV_NO_DEVTOOLS: "1",
      // A Hello prompt can't be answered in CI; the Hello path is covered by
      // the unit-tested wrap/unwrap and a manual check.
      SV_DEVICE_UNLOCK_NO_HELLO: "1",
      SV_SSH_AGENT_SOCK: AGENT_SOCK,
      SV_FOLDER_SYNC_DIR: SYNC_DIR,
    },
  });
  win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test("window is hardened (sandbox, isolation, no node in the page)", async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (x) => !x.webContents.getURL().startsWith("devtools://"),
    )!;
    const p = w.webContents.getLastWebPreferences()!;
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
    };
  });
  expect(prefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });
  expect(await win.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe(
    "undefined",
  );
  expect(await win.evaluate(() => Object.keys(window.electron ?? {}).sort())).toEqual([
    "bridge",
    "clipboard",
    "deviceUnlock",
    "folderSync",
    "platform",
    "sshAgent",
    "updates",
    "version",
    "window",
  ]);
});

test("first run → create vault → app shell with custom title bar", async () => {
  await win.getByRole("button", { name: /create.*vault/i }).click();
  await win.getByLabel(/^master password/i).fill(MASTER);
  await win.getByLabel(/confirm/i).fill(MASTER);
  await win.getByRole("button", { name: /^create vault$/i }).click();
  await expect(win.getByText(/your vault is empty/i)).toBeVisible({ timeout: 45_000 });
  await win.getByRole("button", { name: /skip for now/i }).click();

  const platform = await win.evaluate(() => window.electron?.platform);
  await expect(win.locator("html")).toHaveAttribute(
    "data-titlebar",
    platform === "darwin" ? "inset" : "overlay",
  );
  if (SHOTS) await win.screenshot({ path: path.join(SHOTS, "electron-shell.png") });

  if (platform !== "darwin") {
    // The native window buttons are drawn over the top-right corner; the top
    // bar must keep its own controls out from under them.
    // On right-to-left Windows the buttons are on the left instead; either way
    // no top-bar control may overlap the caption-button area.
    const geo = await win.evaluate(() => {
      const wco = (
        navigator as unknown as { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }
      ).windowControlsOverlay;
      const area = wco.getTitlebarAreaRect();
      const header = document.querySelector("header")!;
      const rects = [...header.querySelectorAll("button")].map((b) => b.getBoundingClientRect());
      return {
        area: { left: area.x, right: area.x + area.width },
        minLeft: Math.min(...rects.map((r) => r.left)),
        maxRight: Math.max(...rects.map((r) => r.right)),
      };
    });
    expect(geo.minLeft).toBeGreaterThanOrEqual(geo.area.left);
    expect(geo.maxRight).toBeLessThanOrEqual(geo.area.right);
  }
});

test("Quick Access hotkey path opens the command palette", async () => {
  // Same code path as the global shortcut: main → renderer "sv-quick-access".
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (x) => !x.webContents.getURL().startsWith("devtools://"),
    )!;
    w.minimize();
    w.restore();
    w.show();
    w.webContents.send("sv-quick-access");
  });
  await expect(win.getByRole("combobox")).toBeVisible();
  await win.waitForTimeout(400); // let the open animation finish for the screenshot
  if (SHOTS) await win.screenshot({ path: path.join(SHOTS, "electron-quick-access.png") });
  await win.keyboard.press("Escape");
});

test("title-bar theme IPC rejects anything but #rrggbb", async () => {
  const results = await win.evaluate(async () => {
    const w = window.electron!.window!;
    const ok = await w
      .setTitleBarTheme({ color: "#ffffff", symbolColor: "#000000" })
      .then(() => "ok");
    const bad = await w
      .setTitleBarTheme({ color: "red; background:url(x)", symbolColor: "#000" } as never)
      .then(() => "ignored");
    return [ok, bad];
  });
  expect(results).toEqual(["ok", "ignored"]);
});

test("sleep / screen lock locks the vault", async () => {
  const lockBtn = win.getByRole("button", { name: /lock vault/i });
  await expect(lockBtn).toBeVisible();
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit("lock-screen"));
  await expect(lockBtn).toHaveCount(0, { timeout: 10_000 });
  await expect(win.locator('input[type="password"]').first()).toBeVisible();
});

test("remember this device: unlock without the master password", async () => {
  test.skip(process.platform === "darwin", "Touch ID can't be driven in CI");
  // Locked by the previous test: unlock with the master password first.
  await win.locator('input[type="password"]').first().fill(MASTER);
  await win.keyboard.press("Enter");
  const lockBtn = win.getByRole("button", { name: /lock vault/i });
  await expect(lockBtn).toBeVisible({ timeout: 45_000 });

  await win.evaluate(() => (location.hash = "#/settings/security"));
  // Stays unchecked until the master password is confirmed in the dialog.
  await win.getByLabel(/remember this device/i).click();
  await win.locator("#device-unlock-pw").fill("not-the-password");
  await win.getByRole("button", { name: /^turn on$/i }).click();
  await expect(win.getByText(/wrong|incorrect/i).first()).toBeVisible({ timeout: 45_000 });
  await win.locator("#device-unlock-pw").fill(MASTER);
  await win.getByRole("button", { name: /^turn on$/i }).click();
  await expect(win.getByText(/master password needed again/i)).toBeVisible({ timeout: 45_000 });

  // What is on disk is OS-encrypted: neither the password nor a raw key.
  const stored = fs.readFileSync(path.join(profile, "device-unlock.json"), "utf8");
  expect(stored).not.toContain(MASTER);
  expect(JSON.parse(stored)).toMatchObject({ v: 1 });

  await lockBtn.click();
  await win.getByRole("button", { name: /unlock with this device/i }).click();
  await expect(lockBtn).toBeVisible({ timeout: 20_000 });

  // Turning it off removes the key.
  await win.evaluate(() => (location.hash = "#/settings/security"));
  await win.getByLabel(/remember this device/i).uncheck();
  await expect.poll(() => fs.existsSync(path.join(profile, "device-unlock.json"))).toBe(false);
});

test("secret copies are kept out of Windows clipboard history, and cleared only if ours", async () => {
  test.skip(process.platform !== "win32", "Windows clipboard history only");
  const r = await win.evaluate(() => window.electron!.clipboard!.writeSecret("copied-Secret-é1"));
  expect(r).toEqual({ ok: true, excluded: true });
  const formats = await app.evaluate(({ clipboard }) => ({
    text: clipboard.readText(),
    exclude: clipboard.has("ExcludeClipboardContentFromMonitorProcessing"),
    history: clipboard.has("CanIncludeInClipboardHistory"),
  }));
  expect(formats).toEqual({ text: "copied-Secret-é1", exclude: true, history: true });
  // Clear wipes our secret...
  expect(await win.evaluate(() => window.electron!.clipboard!.clearSecret())).toBe(true);
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("");
  // ...but not something the user copied afterwards.
  await win.evaluate(() => window.electron!.clipboard!.writeSecret("another"));
  await app.evaluate(({ clipboard }) => clipboard.writeText("user text"));
  expect(await win.evaluate(() => window.electron!.clipboard!.clearSecret())).toBe(false);
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("user text");
  await app.evaluate(({ clipboard }) => clipboard.clear());
});

test("SSH agent: ssh-add lists the vault key; signing needs approval and verifies", async () => {
  test.skip(
    process.platform === "win32" && !fs.existsSync(`${OPENSSH_DIR}ssh-add.exe`),
    "OpenSSH client not installed",
  );
  const env = { ...process.env, SSH_AUTH_SOCK: AGENT_SOCK };
  // An SSH key entry, generated in the app.
  await win.evaluate(() => (location.hash = "#/vault"));
  await win
    .getByRole("button", { name: /add entry/i })
    .first()
    .click();
  await win.getByLabel(/^title/i).fill("e2e server key");
  await win.getByRole("tab", { name: /ssh key/i }).click();
  await win.getByRole("button", { name: /generate ed25519 key/i }).click();
  await expect(win.getByText(/^SHA256:/)).toBeVisible();
  await win.locator('button[type="submit"]').last().click();

  await win.evaluate(() => (location.hash = "#/settings/sshAgent"));
  await win.getByLabel(/turn on the ssh agent/i).check();
  await expect(win.getByText(/SSH_AUTH_SOCK|IdentityAgent/)).toBeVisible();

  const add = spawnSync(`${OPENSSH_DIR}ssh-add`, ["-L"], { env, encoding: "utf8" });
  expect(add.stderr + `status=${add.status}`).toBe("status=0");
  const listed = add.stdout;
  expect(listed).toMatch(/^ssh-ed25519 AAAA\S+ e2e server key$/m);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sv-agent-"));
  const pub = path.join(dir, "key.pub");
  const msg = path.join(dir, "msg.txt");
  fs.writeFileSync(pub, listed.trim().split("\n")[0] + "\n");
  fs.writeFileSync(msg, "signed through the SecureVault agent\n");
  const signing = new Promise<number>((resolve) => {
    const c = execFile(`${OPENSSH_DIR}ssh-keygen`, ["-Y", "sign", "-f", pub, "-n", "file", msg], {
      env,
    });
    c.on("exit", (code) => resolve(code ?? 1));
  });
  // The app asks first.
  await expect(win.getByRole("alertdialog")).toBeVisible({ timeout: 15_000 });
  await win.getByRole("button", { name: /^allow$/i }).click();
  expect(await signing).toBe(0);

  const signers = path.join(dir, "allowed");
  fs.writeFileSync(signers, `me@test ${listed.trim().split(" ").slice(0, 2).join(" ")}\n`);
  const verified = execFileSync(
    `${OPENSSH_DIR}ssh-keygen`,
    ["-Y", "verify", "-f", signers, "-I", "me@test", "-n", "file", "-s", `${msg}.sig`],
    { input: fs.readFileSync(msg), encoding: "utf8" },
  );
  expect(verified).toMatch(/Good "file" signature/);

  // Denying makes the signature fail.
  fs.rmSync(`${msg}.sig`);
  const denied = new Promise<number>((resolve) => {
    const c = execFile(`${OPENSSH_DIR}ssh-keygen`, ["-Y", "sign", "-f", pub, "-n", "file", msg], {
      env,
    });
    c.on("exit", (code) => resolve(code ?? 1));
  });
  await expect(win.getByRole("alertdialog")).toBeVisible({ timeout: 15_000 });
  await win.getByRole("button", { name: /^deny$/i }).click();
  expect(await denied).not.toBe(0);
});

test("folder sync writes only ciphertext and never overwrites another device's copy", async () => {
  const file = path.join(SYNC_DIR, "SecureVault.svault");
  await win.evaluate(() => (location.hash = "#/settings/sync"));
  await win.getByRole("button", { name: /^choose folder$/i }).click();
  await expect(win.getByTestId("sync-folder")).toHaveText(SYNC_DIR);

  // Any change triggers autosave → folder copy.
  await win.evaluate(() => (location.hash = "#/settings/security"));
  await win.getByLabel(/lock immediately/i).click();
  await expect.poll(() => fs.existsSync(file), { timeout: 10_000 }).toBe(true);
  const first = fs.readFileSync(file, "utf8");
  expect(JSON.parse(first)).toMatchObject({ version: 1 });
  expect(first).not.toMatch(/e2e server key|Home Wi-Fi/);

  // "Another device" rewrites the file.
  const other = JSON.stringify({ ...JSON.parse(first), updatedAt: "2099-01-01T00:00:00.000Z" });
  fs.writeFileSync(file, other);
  await win.evaluate(() => (location.hash = "#/settings/security"));
  await win.getByLabel(/lock immediately/i).click();
  await win.evaluate(() => (location.hash = "#/settings/sync"));
  await expect(win.getByText(/changed on another device/i)).toBeVisible({ timeout: 10_000 });
  expect(fs.readFileSync(file, "utf8")).toBe(other);
});

// Last: Playwright keeps waiting on the cancelled navigation afterwards.
test("the window can't be navigated away, and permission requests are denied", async () => {
  const before = win.url();
  await win.evaluate(() => {
    location.href = "https://example.com/";
  });
  await win.waitForTimeout(500);
  expect(win.url()).toBe(before);
  const perm = await win.evaluate(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return "granted";
    } catch (e) {
      return (e as Error).name;
    }
  });
  expect(perm).not.toBe("granted");
  const protectedWin = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((x) => !x.webContents.getURL().startsWith("devtools://"))
      .every((x) => x.isContentProtected()),
  );
  expect(protectedWin).toBe(true);
});
