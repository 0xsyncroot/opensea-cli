#!/usr/bin/env bash
set -euo pipefail

# opensea-cli installer
# Usage:
#   ./install.sh             # install into current shell PATH via npm -g
#   ./install.sh local       # build only (run via ./dist/index.js)

MODE="${1:-global}"

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
dim()   { printf "\033[90m%s\033[0m\n" "$*"; }

cyan "→ opensea-cli installer"

# Node check
if ! command -v node >/dev/null 2>&1; then
  red "✗ Node.js is required. Install Node >= 20 from https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  red "✗ Node.js >= 20 required (found $(node -v))"
  exit 1
fi
dim "✓ node $(node -v)"

# Package manager
if command -v pnpm >/dev/null 2>&1; then PM=pnpm
elif command -v yarn >/dev/null 2>&1; then PM=yarn
else PM=npm
fi
dim "✓ package manager: $PM"

cd "$(dirname "$0")"

cyan "→ Installing dependencies"
case "$PM" in
  pnpm) pnpm install --silent ;;
  yarn) yarn install --silent ;;
  *)    npm install --silent ;;
esac

cyan "→ Building"
npx tsc
chmod +x dist/index.js

if [ "$MODE" = "local" ]; then
  green "✓ Built. Run with:"
  echo "    node dist/index.js help"
  exit 0
fi

cyan "→ Installing globally"
case "$PM" in
  pnpm) pnpm link --global || npm install -g . ;;
  yarn) yarn global add "$(pwd)" || npm install -g . ;;
  *)    npm install -g . ;;
esac

if command -v opensea-cli >/dev/null 2>&1; then
  green "✓ Installed. Try:"
  echo "    opensea-cli help"
  echo "    opensea-cli check --rpc https://eth.llamarpc.com --contract 0x... --fn 'mint(uint256)'"
else
  red "✗ opensea-cli not found in PATH after install."
  red "  npm global bin: $(npm bin -g 2>/dev/null || echo '?')"
  red "  Add the above to your PATH, or run: node $(pwd)/dist/index.js help"
  exit 1
fi
