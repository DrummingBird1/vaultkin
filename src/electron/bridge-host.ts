/**
 * @file src/electron/bridge-host.ts
 * The native-messaging host the browser launches (ADR 0007). Runs as plain
 * Node. Packaged builds ship it as a standalone binary
 * (scripts/build-bridge-host.mjs, a Node single executable), so the app
 * binary keeps the RunAsNode fuse off. In dev it runs as Electron with
 * ELECTRON_RUN_AS_NODE=1 (see bridge-install.ts). The Electron app binary
 * itself can't be the host on Windows because it writes a CRLF to stdout at
 * startup, which corrupts the length-prefixed framing.
 *
 * It only relays frames between the browser and the running app; it never
 * sees vault data (payloads are sealed end to end after pairing).
 */
import { bridgeSocketPath, originFromArgv, runRelay } from "./bridge-transport";

const origin = originFromArgv(process.argv);
if (!origin) {
  process.stderr.write("vaultkin-bridge-host: missing extension origin\n");
  process.exit(2);
} else {
  runRelay(origin, bridgeSocketPath(), (code) => process.exit(code));
}
