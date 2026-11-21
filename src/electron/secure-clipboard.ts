/**
 * @file src/electron/secure-clipboard.ts
 * Copy a secret so Windows keeps it out of Clipboard History (Win+V) and
 * cloud clipboard sync.
 *
 * Windows honours three clipboard formats placed next to the text:
 *   ExcludeClipboardContentFromMonitorProcessing  (present = skip entirely)
 *   CanIncludeInClipboardHistory = DWORD 0
 *   CanUploadToCloudClipboard    = DWORD 0
 * Electron's clipboard API can't write custom formats together with text
 * (each write replaces the clipboard), so on Windows the write goes through
 * the OS's own PowerShell / .NET clipboard. The secret travels on stdin as
 * base64. Never in the command line, which other processes can read.
 * Anywhere else, or if PowerShell is unavailable or blocked, the caller falls
 * back to a normal clipboard write.
 */
import { execFile } from "child_process";
import * as path from "path";

const SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "Add-Type -AssemblyName System.Windows.Forms",
  "$b=[Console]::In.ReadToEnd().Trim()",
  "$t=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b))",
  "$d=New-Object System.Windows.Forms.DataObject",
  "$d.SetText($t,[System.Windows.Forms.TextDataFormat]::UnicodeText)",
  "$z=[byte[]](0,0,0,0)",
  "$d.SetData('ExcludeClipboardContentFromMonitorProcessing',(New-Object IO.MemoryStream(,$z)))",
  "$d.SetData('CanIncludeInClipboardHistory',(New-Object IO.MemoryStream(,$z)))",
  "$d.SetData('CanUploadToCloudClipboard',(New-Object IO.MemoryStream(,$z)))",
  "[System.Windows.Forms.Clipboard]::SetDataObject($d,$true)",
].join(";");

function powershellPath(): string {
  const root = process.env.SystemRoot ?? "C:\\Windows";
  return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** True when the text was written with the history-exclusion formats. */
export function writeSecretExcludedFromHistory(text: string): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = execFile(
      powershellPath(),
      ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT],
      { windowsHide: true, timeout: 5000 },
      (err) => resolve(!err),
    );
    child.stdin?.end(Buffer.from(text, "utf8").toString("base64"));
  });
}
