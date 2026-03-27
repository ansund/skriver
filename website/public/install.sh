#!/usr/bin/env bash
set -euo pipefail

REPO="github:ansund/skriver"

if ! command -v node >/dev/null 2>&1; then
  echo "Skriver needs Node.js 18+ first." >&2
  echo "Install Node, then run this installer again." >&2
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  echo "Installing skriver with pnpm..."
  pnpm add -g "$REPO"
elif command -v npm >/dev/null 2>&1; then
  echo "Installing skriver with npm..."
  npm install -g "$REPO"
else
  echo "Skriver needs npm or pnpm available on your PATH." >&2
  exit 1
fi

echo
echo "Skriver is installed."
echo "Next:"
echo "  skriver doctor"
echo "  skriver transcribe --help"
