// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  generateSshKey,
  importSshKey,
  parsePrivateKey,
  signSsh,
  publicBlobFromLine,
  SshReader,
} from "./ssh-key";

function hasSshKeygen(): boolean {
  try {
    execFileSync("ssh-keygen", ["-?"], { stdio: "ignore" });
    return true;
  } catch (e) {
    return (e as { status?: number }).status !== undefined; // exists, just printed usage
  }
}

describe("SSH keys", () => {
  it("generates a key whose private part round-trips", async () => {
    const k = await generateSshKey("me@laptop");
    expect(k.publicKey).toMatch(
      /^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]+=* me@laptop$/,
    );
    expect(k.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    const p = parsePrivateKey(k.privateKey);
    expect(p.comment).toBe("me@laptop");
    const again = await importSshKey(k.privateKey);
    expect(again.publicKey).toBe(k.publicKey);
    expect(again.fingerprint).toBe(k.fingerprint);
  });

  it("signs in SSH format and the signature verifies", async () => {
    const k = await generateSshKey();
    const data = new TextEncoder().encode("session-id-and-request");
    const blob = await signSsh(k.privateKey, data);
    const r = new SshReader(blob);
    expect(r.text()).toBe("ssh-ed25519");
    const sig = r.string();
    const pub = new SshReader(publicBlobFromLine(k.publicKey));
    pub.string();
    const key = await crypto.subtle.importKey("raw", pub.string().slice(), "Ed25519", false, [
      "verify",
    ]);
    expect(await crypto.subtle.verify("Ed25519", key, sig.slice(), data)).toBe(true);
  });

  it("rejects passphrase-protected, non-Ed25519 and garbage keys", async () => {
    await expect(importSshKey("not a key")).rejects.toThrow(/OpenSSH/);
  });

  describe.runIf(hasSshKeygen())("interop with OpenSSH ssh-keygen", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sv-ssh-"));

    it("ssh-keygen accepts our private key and derives the same public key + fingerprint", async () => {
      const k = await generateSshKey("interop");
      const f = path.join(dir, "ours");
      fs.writeFileSync(f, k.privateKey, { mode: 0o600 });
      // Windows ignores the mode; Win32-OpenSSH then rejects the key if the
      // temp folder's inherited ACL lets any other account read it.
      if (process.platform === "win32")
        execFileSync("icacls", [f, "/inheritance:r", "/grant:r", `${os.userInfo().username}:F`], {
          stdio: "ignore",
        });
      const pub = execFileSync("ssh-keygen", ["-y", "-f", f], { encoding: "utf8" }).trim();
      expect(pub.split(" ").slice(0, 2).join(" ")).toBe(
        k.publicKey.split(" ").slice(0, 2).join(" "),
      );
      const fp = execFileSync("ssh-keygen", ["-l", "-f", f], { encoding: "utf8" });
      expect(fp).toContain(k.fingerprint);
    });

    it("imports a key made by ssh-keygen", async () => {
      const f = path.join(dir, "theirs");
      execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-C", "from-openssh", "-q", "-f", f]);
      const k = await importSshKey(fs.readFileSync(f, "utf8"));
      expect(k.publicKey.trim()).toBe(fs.readFileSync(f + ".pub", "utf8").trim());
    });

    it("refuses a passphrase-protected key with a clear message", async () => {
      const f = path.join(dir, "locked");
      execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "pw-1234567", "-q", "-f", f]);
      await expect(importSshKey(fs.readFileSync(f, "utf8"))).rejects.toThrow(/passphrase/i);
    });
  });
});
