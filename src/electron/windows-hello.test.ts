// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { __scripts, helloSupported } from "./windows-hello";

// The Hello prompt itself needs a person; this checks the scripts are valid
// PowerShell and that the WinRT support query really runs on this machine.
describe.runIf(process.platform === "win32")("Windows Hello scripts", () => {
  it.each(Object.entries(__scripts))("%s parses as PowerShell", (_name, script) => {
    const check =
      "$e=$null;[void][System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$null,[ref]$e);$e.Count";
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", check],
      {
        input: script,
        encoding: "utf8",
      },
    );
    expect(out.trim()).toBe("0");
  });

  it("support query returns a boolean", async () => {
    expect(typeof (await helloSupported())).toBe("boolean");
  }, 20_000);
});
