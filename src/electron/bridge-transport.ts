/**
 * @file src/electron/bridge-transport.ts
 * Native-messaging transport for the extension bridge (ADR 0007).
 *
 *   browser ⇄ (stdio) relay process ⇄ (local socket) main process ⇄ (IPC) renderer
 *
 * Neither the relay nor the main process can read vault data: after the
 * plaintext hello/pairing handshake, payloads are AES-GCM sealed end to end
 * between the extension and the renderer (src/core/bridge/session.ts).
 *
 * Frame format matches src/core/bridge/framing.ts (4-byte LE length + JSON);
 * it's re-implemented here with Buffers because the Electron build compiles
 * only src/electron/.
 */
import * as net from "net";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";
import * as fs from "fs";

export const HOST_NAME = "com.securevault.bridge";
const MAX_FRAME = 1024 * 1024;

/**
 * Per-OS-user socket, computable by both the app and the standalone host
 * without knowing the app's data folder: a named pipe on Windows, a Unix
 * socket (mode 0600) in the user's runtime/temp dir elsewhere.
 * SV_BRIDGE_SOCKET overrides it (isolated test instances).
 */
export function bridgeSocketPath(): string {
  if (process.env.SV_BRIDGE_SOCKET) return process.env.SV_BRIDGE_SOCKET;
  const user = os.userInfo().username;
  const tag = crypto.createHash("sha256").update(`securevault|${user}`).digest("hex").slice(0, 16);
  if (process.platform === "win32") return `\\\\.\\pipe\\securevault-bridge-${tag}`;
  return path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), `securevault-bridge-${tag}.sock`);
}

export function encode(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  if (body.length > MAX_FRAME) throw new Error("Frame too large");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

export class Decoder {
  private buf = Buffer.alloc(0);
  push(chunk: Buffer): unknown[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: unknown[] = [];
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32LE(0);
      if (len > MAX_FRAME) throw new Error("Frame too large");
      if (this.buf.length < 4 + len) break;
      out.push(JSON.parse(this.buf.subarray(4, 4 + len).toString("utf8")));
      this.buf = this.buf.subarray(4 + len);
    }
    return out;
  }
}

/** The browser passes the calling extension's origin as an argument. */
export function originFromArgv(argv: string[]): string | null {
  const chrome = argv.find((a) => /^chrome-extension:\/\/[a-p]{32}\/$/.test(a));
  if (chrome) return chrome;
  // Firefox: <manifest path> <extension id>
  const ff = argv.find((a) => /^[\w.-]+@[\w.-]+$/.test(a) || /^\{[0-9a-f-]{36}\}$/i.test(a));
  return ff ? `moz-extension-id:${ff}` : null;
}

/**
 * Relay mode: copy frames between the browser (stdin/stdout) and the running
 * app's socket. The first frame sent to the app is a relay-authored hello
 * carrying the origin the *browser* reported — the extension can't spoof it.
 */
export function runRelay(origin: string, socketPath: string, onExit: (code: number) => void): void {
  const toBrowser = (msg: unknown) => process.stdout.write(encode(msg));
  const sock = net.connect(socketPath);
  let connected = false;

  sock.on("connect", () => {
    connected = true;
    sock.write(encode({ t: "relay-hello", origin }));
    process.stdin.on("data", (chunk: Buffer) => sock.write(chunk)); // already framed by the browser
    process.stdin.on("end", () => sock.end());
  });
  sock.on("data", (chunk: Buffer) => process.stdout.write(chunk)); // already framed by the app
  sock.on("error", () => {
    if (!connected) toBrowser({ t: "error", code: "app-not-running" });
    onExit(connected ? 1 : 0);
  });
  sock.on("close", () => onExit(0));
}

export interface BridgeConnectionHandlers {
  /** A decoded frame from a connection; origin is set by the relay hello. */
  onFrame(connId: number, origin: string, msg: unknown): void;
  onClose(connId: number): void;
}

/** Main-process side: accept relay connections and hand frames to the renderer. */
export function startBridgeServer(socketPath: string, handlers: BridgeConnectionHandlers) {
  const conns = new Map<number, net.Socket>();
  let nextId = 1;

  const server = net.createServer((sock) => {
    const id = nextId++;
    const dec = new Decoder();
    let origin: string | null = null;
    conns.set(id, sock);
    sock.on("data", (chunk: Buffer) => {
      let msgs: unknown[];
      try {
        msgs = dec.push(chunk);
      } catch {
        sock.destroy();
        return;
      }
      for (const m of msgs) {
        if (origin === null) {
          const hello = m as { t?: unknown; origin?: unknown };
          if (hello?.t !== "relay-hello" || typeof hello.origin !== "string") return sock.destroy();
          origin = hello.origin;
          continue;
        }
        handlers.onFrame(id, origin, m);
      }
    });
    const done = () => {
      if (conns.delete(id)) handlers.onClose(id);
    };
    sock.on("close", done);
    sock.on("error", done);
  });

  if (process.platform !== "win32") {
    // A stale socket file from a crash would make listen() fail.
    try {
      fs.unlinkSync(socketPath);
    } catch {
      /* not there */
    }
  }
  server.listen(socketPath, () => {
    // Only this OS user may connect on Unix.
    if (process.platform !== "win32") fs.chmodSync(socketPath, 0o600);
  });

  return {
    send(connId: number, msg: unknown): boolean {
      const s = conns.get(connId);
      if (!s) return false;
      s.write(encode(msg));
      return true;
    },
    close(connId: number) {
      conns.get(connId)?.destroy();
    },
    stop() {
      for (const s of conns.values()) s.destroy();
      server.close();
    },
  };
}
