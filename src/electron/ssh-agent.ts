/**
 * @file src/electron/ssh-agent.ts
 * SSH agent (draft-miller-ssh-agent) served from the desktop app.
 *
 *   ssh ⇄ (named pipe / Unix socket) main process ⇄ (IPC) renderer
 *
 * The main process only frames the protocol. Keys stay in the renderer,
 * inside the unlocked vault. Listing gives public keys only. Every signature
 * is approved by the user in the app.
 *
 * Supported: REQUEST_IDENTITIES (11) → IDENTITIES_ANSWER (12),
 * SIGN_REQUEST (13) → SIGN_RESPONSE (14). Everything else, including adding
 * or removing keys, gets FAILURE (5): keys are managed in the vault only.
 */
import * as net from "net";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

const FAILURE = 5;
const REQUEST_IDENTITIES = 11;
const IDENTITIES_ANSWER = 12;
const SIGN_REQUEST = 13;
const SIGN_RESPONSE = 14;
const MAX_MSG = 256 * 1024;

export type AgentRequest =
  { kind: "list" } | { kind: "sign"; keyBlob: string; data: string; flags: number };

export interface AgentIdentity {
  /** base64 public key blob */
  blob: string;
  comment: string;
}

export interface AgentHandler {
  list(): Promise<AgentIdentity[]>;
  /** base64 SSH signature blob, or null when refused / unavailable. */
  sign(req: Extract<AgentRequest, { kind: "sign" }>): Promise<string | null>;
}

/** Per-OS-user path. SV_SSH_AGENT_SOCK overrides it (tests). */
export function sshAgentPath(): string {
  if (process.env.SV_SSH_AGENT_SOCK) return process.env.SV_SSH_AGENT_SOCK;
  const user = os.userInfo().username;
  const tag = crypto
    .createHash("sha256")
    .update(`securevault-ssh|${user}`)
    .digest("hex")
    .slice(0, 12);
  if (process.platform === "win32") return `\\\\.\\pipe\\securevault-ssh-agent-${tag}`;
  return path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), `securevault-ssh-agent-${tag}.sock`);
}

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
};
const sshString = (b: Buffer) => Buffer.concat([u32(b.length), b]);
const frame = (type: number, body: Buffer = Buffer.alloc(0)) =>
  Buffer.concat([u32(body.length + 1), Buffer.from([type]), body]);

function readString(b: Buffer, o: number): [Buffer, number] {
  if (o + 4 > b.length) throw new Error("truncated");
  const n = b.readUInt32BE(o);
  if (o + 4 + n > b.length) throw new Error("truncated");
  return [b.subarray(o + 4, o + 4 + n), o + 4 + n];
}

/** Handle one agent message (type byte + payload) and return the reply frame. */
export async function handleMessage(msg: Buffer, h: AgentHandler): Promise<Buffer> {
  try {
    const type = msg[0];
    if (type === REQUEST_IDENTITIES) {
      const ids = await h.list();
      return frame(
        IDENTITIES_ANSWER,
        Buffer.concat([
          u32(ids.length),
          ...ids.flatMap((i) => [
            sshString(Buffer.from(i.blob, "base64")),
            sshString(Buffer.from(i.comment, "utf8")),
          ]),
        ]),
      );
    }
    if (type === SIGN_REQUEST) {
      const [blob, o1] = readString(msg, 1);
      const [data, o2] = readString(msg, o1);
      const flags = o2 + 4 <= msg.length ? msg.readUInt32BE(o2) : 0;
      const sig = await h.sign({
        kind: "sign",
        keyBlob: blob.toString("base64"),
        data: data.toString("base64"),
        flags,
      });
      return sig ? frame(SIGN_RESPONSE, sshString(Buffer.from(sig, "base64"))) : frame(FAILURE);
    }
  } catch {
    /* malformed: fall through */
  }
  return frame(FAILURE);
}

export function startSshAgent(
  socketPath: string,
  h: AgentHandler,
  onError?: (err: Error) => void,
): { stop(): void } {
  if (process.platform !== "win32") {
    try {
      fs.unlinkSync(socketPath); // stale socket from a crash
    } catch {
      /* none */
    }
  }
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    let busy = Promise.resolve();
    sock.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0 || len > MAX_MSG) {
          sock.destroy();
          return;
        }
        if (buf.length < 4 + len) break;
        const msg = Buffer.from(buf.subarray(4, 4 + len));
        buf = buf.subarray(4 + len);
        // Replies must stay in request order.
        busy = busy.then(async () => {
          const reply = await handleMessage(msg, h);
          if (!sock.destroyed) sock.write(reply);
        });
      }
    });
    sock.on("error", () => sock.destroy());
  });
  // e.g. the pipe name is already taken: report instead of crashing main.
  server.on("error", (err) => onError?.(err));
  server.listen(socketPath, () => {
    if (process.platform !== "win32") fs.chmodSync(socketPath, 0o600);
  });
  return {
    stop: () => {
      server.close();
      if (process.platform !== "win32") fs.rmSync(socketPath, { force: true });
    },
  };
}
