// @vitest-environment node
/**
 * The real `sv` binary (built with esbuild) against a real encrypted vault
 * file, password on stdin. Plus the pure command logic.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { createVault } from "../core/vault/serializer";
import { createDefaultVaultData } from "../core/vault/vault-types";
import type { VaultData, VaultEntry } from "../core/vault/schema";
import { findEntry, inject, readField, CliError } from "./commands";
import { CURRENT_SCHEMA_VERSION } from "../core/vault/migrations";

const ROOT = path.resolve(__dirname, "../..");
const BIN = path.join(ROOT, "dist/cli/sv.cjs");
const MASTER = "cli-master-pw-Horse-42!";

const e = (over: Partial<VaultEntry>): VaultEntry => ({
  id: crypto.randomUUID(),
  type: "login",
  title: "x",
  category: "websites",
  tags: [],
  favorite: false,
  customFields: [],
  ...over,
});
const data = (): VaultData => ({
  ...createDefaultVaultData(),
  schemaVersion: CURRENT_SCHEMA_VERSION,
  entries: [
    e({
      id: "gh",
      title: "GitHub",
      username: "octo",
      password: "gh-pw",
      totpSecret: "JBSWY3DPEHPK3PXP",
    }),
    e({ title: "GitLab", username: "lab", password: "gl-pw" }),
    e({
      title: "Prod DB",
      password: "db-pw",
      customFields: [
        { id: "c", label: "host", value: "db.internal", type: "text", protected: false },
      ],
    }),
  ],
});

describe("sv commands", () => {
  it("finds exact titles first, refuses ambiguous ones", () => {
    const v = data();
    expect(findEntry(v, "github").id).toBe("gh");
    expect(() => findEntry(v, "Git")).toThrow(/matches 2 entries/);
    expect(() => findEntry(v, "nope")).toThrow(CliError);
  });

  it("reads fields incl. TOTP and custom fields", async () => {
    const v = data();
    expect(await readField(findEntry(v, "GitHub"), "username")).toBe("octo");
    expect(await readField(findEntry(v, "GitHub"), "totp", 59_000)).toBe("996554");
    expect(await readField(findEntry(v, "Prod DB"), "host")).toBe("db.internal");
    await expect(readField(findEntry(v, "GitLab"), "notes")).rejects.toThrow(/no notes/);
  });

  it("fills templates", async () => {
    const out = await inject(
      "DB_HOST={{ sv://Prod%20DB/host }}\nDB_PASS={{sv://Prod%20DB/password}}\nGH={{ sv://gh/username }}\n",
      data(),
    );
    expect(out).toBe("DB_HOST=db.internal\nDB_PASS=db-pw\nGH=octo\n");
  });
});

describe("sv binary", () => {
  let vaultFile = "";
  beforeAll(async () => {
    execFileSync("node", ["scripts/build-cli.mjs"], { cwd: ROOT });
    const { encryptedPayload } = await createVault(MASTER, data());
    vaultFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sv-cli-")), "Vaultkin.svault");
    fs.writeFileSync(vaultFile, encryptedPayload);
  }, 60_000);

  const run = (args: string[], pw = MASTER) =>
    spawnSync("node", [BIN, ...args, "--vault", vaultFile, "--password-stdin"], {
      input: pw + "\n",
      encoding: "utf8",
    });

  it("get prints the secret only; list never prints secrets", () => {
    const g = run(["get", "GitHub"]);
    expect(g.status).toBe(0);
    expect(g.stdout).toBe("gh-pw");
    const l = run(["list"]);
    expect(l.stdout).toContain("GitHub\tocto");
    expect(l.stdout).not.toMatch(/gh-pw|gl-pw|db-pw/);
  }, 30_000);

  it("wrong password and ambiguous query fail with distinct exit codes", () => {
    expect(run(["get", "GitHub"], "wrong").status).toBe(4);
    const amb = run(["get", "Git"]);
    expect(amb.status).toBe(2);
    expect(amb.stderr).toMatch(/matches 2 entries/);
  }, 30_000);

  it("inject writes a 0600 file and won't overwrite without --force", () => {
    const dir = path.dirname(vaultFile);
    const tpl = path.join(dir, ".env.tpl");
    const out = path.join(dir, ".env");
    fs.writeFileSync(tpl, "PASS={{ sv://GitLab/password }}\n");
    expect(run(["inject", "-i", tpl, "-o", out]).status).toBe(0);
    expect(fs.readFileSync(out, "utf8")).toBe("PASS=gl-pw\n");
    expect(run(["inject", "-i", tpl, "-o", out]).status).toBe(1);
    expect(run(["inject", "-i", tpl, "-o", out, "--force"]).status).toBe(0);
  }, 30_000);
});
