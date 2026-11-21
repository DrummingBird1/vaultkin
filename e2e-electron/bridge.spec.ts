/**
 * Electron E2E for the extension bridge (ADR 0007), without a real browser:
 * the test spawns the relay exactly as Chrome would (SecureVault executable +
 * extension origin argument, native-messaging stdio framing) and plays the
 * extension's side with the same protocol code the extension bundles.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import {
  BridgeSession,
  connectionNonce,
  exportPublicKey,
  generateIdentity,
  pairingCode,
  type SealedMessage,
} from "../src/core/bridge/session";

/** A frame from the app, as the extension sees it. */
type Frame = { t?: string; pub?: string; nonce?: string; m?: SealedMessage; [k: string]: unknown };

const root = path.resolve(__dirname, "..");
const electronBin = createRequire(__filename)("electron") as unknown as string;
const MASTER = "correct-horse-battery-staple-77!";
const EXT_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/";

// Isolated bridge socket for this test run (the real app uses a per-OS-user one).
const SOCKET =
  process.platform === "win32"
    ? String.raw`\\.\pipe\sv-e2e-` + `${process.pid}-${Date.now()}`
    : path.join(os.tmpdir(), `sv-e2e-${process.pid}-${Date.now()}.sock`);
const HOST_JS = path.join(root, "dist", "electron", "bridge-host.js");

let app: ElectronApplication;
let win: Page;
let profile: string;

/** A fake browser: speaks native messaging to the relay over stdio. */
class FakeBrowser {
  private proc: ChildProcessWithoutNullStreams;
  private buf = Buffer.alloc(0);
  private waiters: Array<(m: unknown) => void> = [];
  private queue: unknown[] = [];
  closed = false;

  constructor(origin: string) {
    // Exactly what the installed host wrapper runs: Electron in Node mode + bridge-host.js.
    this.proc = spawn(electronBin, [HOST_JS, origin], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", SV_BRIDGE_SOCKET: SOCKET },
    });
    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      while (this.buf.length >= 4) {
        const len = this.buf.readUInt32LE(0);
        if (this.buf.length < 4 + len) break;
        const msg = JSON.parse(this.buf.subarray(4, 4 + len).toString("utf8"));
        this.buf = this.buf.subarray(4 + len);
        const w = this.waiters.shift();
        if (w) w(msg);
        else this.queue.push(msg);
      }
    });
    this.proc.on("exit", () => (this.closed = true));
  }
  send(msg: unknown) {
    const body = Buffer.from(JSON.stringify(msg));
    const head = Buffer.alloc(4);
    head.writeUInt32LE(body.length);
    this.proc.stdin.write(Buffer.concat([head, body]));
  }
  next(timeout = 15_000): Promise<Frame> {
    if (this.queue.length) return Promise.resolve(this.queue.shift() as Frame);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout waiting for frame")), timeout);
      this.waiters.push((m) => {
        clearTimeout(t);
        resolve(m as Frame);
      });
    });
  }
  kill() {
    this.proc.kill();
  }
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "sv-bridge-"));
  app = await electron.launch({
    args: [root, `--user-data-dir=${profile}`],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: "http://localhost:5173",
      SV_NO_DEVTOOLS: "1",
      SV_BRIDGE_SOCKET: SOCKET,
    },
  });
  win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test("a locked vault answers hello with locked", async () => {
  // First run: no vault yet → still "locked" from the bridge's point of view.
  const ext = await generateIdentity();
  const b = new FakeBrowser(EXT_ORIGIN);
  b.send({ t: "hello", pub: await exportPublicKey(ext.publicKey), nonce: connectionNonce() });
  expect(await b.next()).toEqual({ t: "hello", locked: true });
  b.kill();
});

test("pair with numeric comparison, then fetch only this site's credentials", async () => {
  // Create a vault and one login in the app.
  await win.getByRole("button", { name: /create.*vault/i }).click();
  await win.getByLabel(/^master password/i).fill(MASTER);
  await win.getByLabel(/confirm/i).fill(MASTER);
  await win.getByRole("button", { name: /^create vault$/i }).click();
  await win.getByRole("button", { name: /skip for now/i }).click({ timeout: 45_000 });
  await win.keyboard.press("Control+N");
  const d = win.getByRole("dialog");
  await d.getByLabel(/title/i).fill("GitHub");
  await d.getByLabel(/username/i).fill("octo");
  await d.getByLabel(/^url$/i).fill("https://github.com");
  await d.locator('input[type="password"]').first().fill("gh-secret-pw-123");
  await d.getByRole("button", { name: /^add entry$/i }).click();

  const ext = await generateIdentity();
  const extPub = await exportPublicKey(ext.publicKey);
  const extNonce = connectionNonce();
  const b = new FakeBrowser(EXT_ORIGIN);
  b.send({ t: "hello", pub: extPub, nonce: extNonce });
  const hello = await b.next();
  expect(hello).toMatchObject({ t: "hello", locked: false, paired: false });

  // Not paired yet: sealed requests are refused.
  const session = await BridgeSession.establish(ext, extPub, hello.pub!, "extension", {
    extension: extNonce,
    app: hello.nonce!,
  });
  b.send({ t: "sealed", m: await session.seal({ op: "status" }) });
  expect(await b.next()).toEqual({ t: "error", code: "not-paired" });

  // Pairing: the app shows a code; it must equal the one the extension computes.
  b.send({ t: "pair-request" });
  const dialog = win.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  const shown = (await dialog.locator("p.font-mono").innerText()).replace(/\s/g, "");
  expect(shown).toBe(await pairingCode(hello.pub!, extPub, EXT_ORIGIN));
  await dialog.getByRole("button", { name: /codes match/i }).click();
  expect(await b.next()).toEqual({ t: "pair-result", ok: true });

  // Sealed: credentials for github.com, nothing for another site.
  b.send({
    t: "sealed",
    m: await session.seal({ op: "credentials-for-url", url: "https://github.com/login" }),
  });
  const res = (await session.open((await b.next()).m!)) as {
    ok: boolean;
    credentials: Array<Record<string, unknown>>;
  };
  expect(res.ok).toBe(true);
  expect(res.credentials).toHaveLength(1);
  expect(res.credentials[0]).toMatchObject({
    title: "GitHub",
    username: "octo",
    password: "gh-secret-pw-123",
    exactHost: true,
  });
  expect(Object.keys(res.credentials[0]).sort()).toEqual([
    "exactHost",
    "hasTotp",
    "id",
    "password",
    "title",
    "url",
    "username",
  ]);

  b.send({
    t: "sealed",
    m: await session.seal({
      op: "credentials-for-url",
      url: "https://github.com.evil.example/login",
    }),
  });
  const other = (await session.open((await b.next()).m!)) as { credentials: unknown[] };
  expect(other.credentials).toEqual([]);

  // A replayed frame drops the connection.
  const replay = await session.seal({ op: "status" });
  b.send({ t: "sealed", m: replay });
  await session.open((await b.next()).m!);
  b.send({ t: "sealed", m: replay });
  await expect.poll(() => b.closed, { timeout: 10_000 }).toBe(true);
});

test("a different key for the same origin is not trusted; locking closes sessions", async () => {
  // Impostor: same origin, new key pair → not paired.
  const mallory = await generateIdentity();
  const m = new FakeBrowser(EXT_ORIGIN);
  m.send({ t: "hello", pub: await exportPublicKey(mallory.publicKey), nonce: connectionNonce() });
  expect(await m.next()).toMatchObject({ t: "hello", locked: false, paired: false });
  m.kill();

  // Lock: an open connection is closed by the app.
  const ext = await generateIdentity();
  const b = new FakeBrowser(EXT_ORIGIN);
  b.send({ t: "hello", pub: await exportPublicKey(ext.publicKey), nonce: connectionNonce() });
  await b.next();
  await win.keyboard.press("Control+L");
  await expect.poll(() => b.closed, { timeout: 10_000 }).toBe(true);
});
