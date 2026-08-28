#!/usr/bin/env bash
# SecureVault launcher (macOS / Linux)
#
# Usage:
#   ./launch.sh                  # Electron dev mode (default)
#   ./launch.sh --web            # Web dev server only (no Electron)
#   ./launch.sh --build          # Production build, then launch the result

set -euo pipefail
cd "$(dirname "$0")"

color() { printf "\033[%sm%s\033[0m\n" "$1" "$2"; }
info()  { color "1;36" "[INFO]  $1"; }
warn()  { color "1;33" "[WARN]  $1"; }
err()   { color "1;31" "[ERROR] $1"; }
ok()    { color "1;32" "[OK]    $1"; }

echo
color "1;36" "  SecureVault launcher"
color "0;36" "  --------------------"
echo

# --- Check Node ---
if ! command -v node >/dev/null 2>&1; then
  err "Node.js not found on PATH. Install Node 20+ from https://nodejs.org/"
  exit 1
fi
node_major=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$node_major" -lt 20 ]; then
  warn "Node $(node -v) detected; SecureVault expects 20+."
fi
ok "Node $(node -v)"

# --- Check pnpm ---
if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm not found on PATH. Install it with: corepack enable  (or: npm install -g pnpm)"
  exit 1
fi

# --- Install deps on first run ---
if [ ! -d "node_modules" ]; then
  info "node_modules missing — running 'pnpm install'..."
  pnpm install
fi
ok "Dependencies ready"

# --- Mode selection ---
mode="electron"
for arg in "$@"; do
  case "$arg" in
    --web)   mode="web"   ;;
    --build) mode="build" ;;
    -h|--help)
      cat <<EOF
Usage: $0 [--web|--build]
  (no flag)  Run Electron + Vite (dev mode, HMR)
  --web      Run Vite dev server only at http://localhost:5173
  --build    Build production Electron app and launch it
EOF
      exit 0
      ;;
  esac
done

case "$mode" in
  electron)
    info "Starting Electron + Vite (Ctrl+C to stop)..."
    pnpm run electron:dev || { warn "electron:dev failed — falling back to web mode."; pnpm run dev; }
    ;;
  web)
    info "Starting Vite dev server at http://localhost:5173..."
    pnpm run dev
    ;;
  build)
    info "Building production Electron app..."
    pnpm run electron:build
    case "$(uname -s)" in
      Darwin*) open release/*.dmg 2>/dev/null || open release/mac/*.app 2>/dev/null || true ;;
      Linux*)  xdg-open release/*.AppImage 2>/dev/null || true ;;
    esac
    ok "Build finished — artifacts under ./release"
    ;;
esac
