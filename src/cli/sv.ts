/**
 * @file src/cli/sv.ts
 * `sv`: read-only command line access to a Vaultkin vault file.
 *
 *   sv list [filter]
 *   sv get <title|id> [field]           field: password (default), username, url,
 *                                       notes, totp, title, ssh-public-key, or a
 *                                       custom field's label
 *   sv inject -i template [-o out]      replaces {{ sv://<title>/<field> }}
 *
 * Options: --vault <file>   (else $SV_VAULT, else the desktop app's sync folder copy)
 *          --password-stdin (read the master password from stdin instead of a prompt)
 *          --force          (inject: overwrite the output file)
 *
 * The vault file is the encrypted blob the desktop app writes to its sync
 * folder (Settings → Sync). The master password is never accepted as an
 * argument or environment variable (both leak to other processes and history).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { openVault } from "../core/vault/serializer";
import { WrongPasswordError, VaultCorruptError } from "../core/errors";
import { CliError, findEntry, inject, listEntries, readField } from "./commands";

const USAGE = `usage:
  sv list [filter]
  sv get <title|id> [field]
  sv inject -i <template> [-o <output>] [--force]
options: --vault <file>  --password-stdin`;

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const opt: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--password-stdin" || a === "--force" || a === "-h" || a === "--help") opt[a] = true;
    else if (a === "--vault" || a === "-i" || a === "-o") {
      const v = argv[++i];
      if (!v) throw new CliError(`${a} needs a value\n${USAGE}`);
      opt[a] = v;
    } else if (a.startsWith("-")) throw new CliError(`Unknown option ${a}\n${USAGE}`);
    else pos.push(a);
  }
  return { pos, opt };
}

function appDataDir(): string {
  const base =
    process.platform === "win32"
      ? (process.env.APPDATA ?? os.homedir())
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : (process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"));
  // Packaged app uses "Vaultkin", dev uses "vaultkin"; the app keeps using a
  // pre-rename "SecureVault"/"securevault" folder if one exists.
  const names = ["SecureVault", "securevault", "Vaultkin", "vaultkin"];
  const found = names.map((n) => path.join(base, n)).find((p) => fs.existsSync(p));
  return found ?? path.join(base, "Vaultkin");
}

function vaultPath(opt: Record<string, string | true>): string {
  if (typeof opt["--vault"] === "string") return opt["--vault"];
  if (process.env.SV_VAULT) return process.env.SV_VAULT;
  try {
    const c = JSON.parse(fs.readFileSync(path.join(appDataDir(), "folder-sync.json"), "utf8"));
    if (typeof c.dir === "string") return path.join(c.dir, "Vaultkin.svault");
  } catch {
    /* no sync folder configured */
  }
  throw new CliError(
    "No vault file. Pass --vault <file>, set SV_VAULT, or choose a sync folder in the app (Settings → Sync).",
  );
}

async function readPassword(fromStdin: boolean): Promise<string> {
  if (fromStdin) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks)
      .toString("utf8")
      .replace(/\r?\n$/, "");
  }
  if (!process.stdin.isTTY)
    throw new CliError("No terminal for the password prompt; use --password-stdin");
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });
    process.stderr.write("Master password: ");
    // Mute echo.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question("", (pw) => {
      rl.close();
      process.stderr.write("\n");
      resolve(pw);
    });
  });
}

export async function main(argv: string[]): Promise<number> {
  const { pos, opt } = parseArgs(argv);
  const cmd = pos[0];
  if (!cmd || opt["-h"] || opt["--help"]) {
    process.stdout.write(USAGE + "\n");
    return opt["-h"] || opt["--help"] ? 0 : 1;
  }
  if (!["list", "get", "inject"].includes(cmd))
    throw new CliError(`Unknown command ${cmd}\n${USAGE}`);
  if (cmd === "get" && !pos[1]) throw new CliError(`sv get needs a title or id\n${USAGE}`);
  if (cmd === "inject" && typeof opt["-i"] !== "string")
    throw new CliError(`sv inject needs -i <template>\n${USAGE}`);

  const file = vaultPath(opt);
  if (!fs.existsSync(file)) throw new CliError(`Vault file not found: ${file}`);
  const payload = fs.readFileSync(file, "utf8");
  const password = await readPassword(opt["--password-stdin"] === true);
  let vault;
  try {
    ({ vault } = await openVault(payload, password));
  } catch (e) {
    if (e instanceof WrongPasswordError) throw new CliError("Wrong master password", 4);
    if (e instanceof VaultCorruptError) throw new CliError("The vault file is damaged", 5);
    throw e;
  }

  if (cmd === "list") {
    const out = listEntries(vault, pos[1]);
    if (out) process.stdout.write(out + "\n");
  } else if (cmd === "get") {
    const v = await readField(findEntry(vault, pos[1]), pos[2] ?? "password");
    process.stdout.write(v + (process.stdout.isTTY ? "\n" : ""));
  } else {
    const out = await inject(fs.readFileSync(opt["-i"] as string, "utf8"), vault);
    const o = opt["-o"];
    if (typeof o === "string") {
      if (fs.existsSync(o) && !opt["--force"])
        throw new CliError(`${o} exists; use --force to overwrite`);
      fs.writeFileSync(o, out, { mode: 0o600 });
    } else process.stdout.write(out);
  }
  return 0;
}

// Run when executed directly (bundled to dist/cli/sv.cjs).
if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`sv: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(e instanceof CliError ? e.exitCode : 1);
    },
  );
}
