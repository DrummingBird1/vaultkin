/**
 * @file src/electron/windows-hello.ts
 * Windows Hello key binding for "remember this device".
 *
 * Windows Hello keeps an RSA key (TPM-backed where available) that can only
 * be used after the user passes Hello (face, fingerprint or PIN). RSA
 * PKCS#1 v1.5 signatures are deterministic, so the signature over a fixed
 * random challenge is a stable secret that can only be produced through a
 * Hello prompt. SHA-256 of it wraps the vault key *in addition to* DPAPI, so
 * another process running as the same Windows user can no longer unwrap it.
 *
 * Electron has no WinRT bridge; the OS's own Windows PowerShell 5.1 calls
 * Windows.Security.Credentials.KeyCredentialManager. Only the non-secret
 * challenge goes in; the signature comes back on stdout.
 */
import { execFile } from "child_process";
import * as path from "path";

const KEY_NAME = "SecureVault-device-unlock";

const PRELUDE = [
  "$ErrorActionPreference='Stop'",
  "Add-Type -AssemblyName System.Runtime.WindowsRuntime",
  "$asTask=[System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'}|Select-Object -First 1",
  "function Await($op,[Type]$t){$k=$asTask.MakeGenericMethod($t).Invoke($null,@($op));$k.Wait()|Out-Null;$k.Result}",
  "$null=[Windows.Security.Credentials.KeyCredentialManager,Windows.Security.Credentials,ContentType=WindowsRuntime]",
  "$null=[Windows.Security.Cryptography.CryptographicBuffer,Windows.Security.Cryptography,ContentType=WindowsRuntime]",
  "$M=[Windows.Security.Credentials.KeyCredentialManager]",
].join(";");

const SUPPORTED = `${PRELUDE};if(Await ($M::IsSupportedAsync()) ([bool])){'yes'}else{'no'}`;

// Open (or create, first time) the Hello key, then sign the challenge.
// Exit 2 = user cancelled / Hello failed.
const SIGN = [
  PRELUDE,
  "$c=[Console]::In.ReadToEnd().Trim()",
  "$R=[Windows.Security.Credentials.KeyCredentialRetrievalResult]",
  `$r=Await ($M::OpenAsync('${KEY_NAME}')) ($R)`,
  `if($r.Status -ne 'Success'){$r=Await ($M::RequestCreateAsync('${KEY_NAME}',[Windows.Security.Credentials.KeyCredentialCreationOption]::FailIfExists)) ($R)}`,
  "if($r.Status -ne 'Success'){exit 2}",
  "$buf=[Windows.Security.Cryptography.CryptographicBuffer]::DecodeFromBase64String($c)",
  "$s=Await ($r.Credential.RequestSignAsync($buf)) ([Windows.Security.Credentials.KeyCredentialOperationResult])",
  "if($s.Status -ne 'Success'){exit 2}",
  "[Windows.Security.Cryptography.CryptographicBuffer]::EncodeToBase64String($s.Result)",
].join(";");

function run(script: string, stdin: string, timeoutMs: number): Promise<string | null> {
  if (process.platform !== "win32") return Promise.resolve(null);
  const ps = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return new Promise((resolve) => {
    const child = execFile(
      ps,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: timeoutMs },
      (err, stdout) => resolve(err ? null : stdout.trim()),
    );
    child.stdin?.end(stdin);
  });
}

let supportedCache: boolean | null = null;
export async function helloSupported(): Promise<boolean> {
  if (supportedCache === null) supportedCache = (await run(SUPPORTED, "", 15_000)) === "yes";
  return supportedCache;
}

/** Prompt Windows Hello and return the deterministic signature (base64), or
 *  null when cancelled / unavailable. */
export async function helloSign(challengeB64: string): Promise<string | null> {
  const out = await run(SIGN, challengeB64, 120_000);
  return out && /^[A-Za-z0-9+/]+={0,2}$/.test(out) ? out : null;
}

/** Exposed for the syntax check in windows-hello.test.ts. */
export const __scripts = { SUPPORTED, SIGN };
