#!/usr/bin/env bash
# install.sh — POSIX wrapper for the WhyBuy installer.
# Forwards every argument to `node scripts/install.mjs`.
#
# Usage:
#   ./scripts/install.sh
#   ./scripts/install.sh --browser firefox
#   ./scripts/install.sh --no-build --path "$HOME/whybuy-chrome"

set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR/.."
exec node "$SCRIPT_DIR/install.mjs" "$@"
