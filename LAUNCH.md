# Launching SecureVault

Three launcher scripts at the project root, one per platform. All do the same thing: check Node, install deps on first run, start Electron + Vite in dev mode (HMR).

## Windows

**Easiest:** double-click [`launch.bat`](launch.bat). A console window opens, dependencies install if needed, the Electron window appears.

**To pin to taskbar / Start menu:**

1. Right-click `launch.bat` → **Create shortcut**.
2. Right-click the shortcut → **Properties** → **Change Icon...** and pick a lock-like icon (or supply your own `.ico`).
3. Drag the shortcut to the taskbar or `%APPDATA%\Microsoft\Windows\Start Menu\Programs\`.

**For PowerShell power-users:** [`launch.ps1`](launch.ps1) gives nicer colored output plus options:

```powershell
.\launch.ps1                # Electron + Vite dev mode
.\launch.ps1 -Web           # Web only at http://localhost:5173
.\launch.ps1 -Build         # Production build + launch the .exe
```

If PowerShell refuses to run it, one-time:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## macOS / Linux

```bash
chmod +x launch.sh         # first time only
./launch.sh                # Electron + Vite (default)
./launch.sh --web          # Vite dev server only
./launch.sh --build        # Build .dmg / .AppImage and launch it
```

To make it double-clickable on macOS, rename to `launch.command`. On Linux, create a `.desktop` file:

```ini
[Desktop Entry]
Name=SecureVault
Exec=/absolute/path/to/launch.sh
Icon=/absolute/path/to/icon.png
Type=Application
Categories=Utility;Security;
```

Drop it into `~/.local/share/applications/`.

## What the launchers do

1. Verify `node` is on PATH and is version 20+, and `pnpm` is on PATH (install via `corepack enable`).
2. Run `pnpm install` if `node_modules/` is missing.
3. Run `pnpm run electron:dev` (Electron window + Vite dev server with HMR).
4. Fall back to `pnpm run dev` (browser-only) if Electron fails to start — useful on machines where native deps haven't built.

Once running, the unlock page appears. On first launch you'll see the **Create New Vault** flow ([Unlock.page.tsx:148-161](src/pages/Unlock.page.tsx)). Pick a strong master password (the app enforces "Strong" minimum) and you're in.
