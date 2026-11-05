#!/usr/bin/env sh
# Starts ReadItForMe (macOS / Linux). Installs uv if needed; uv takes care of Python and dependencies.
set -e
cd "$(dirname "$0")"
if ! command -v uv >/dev/null 2>&1; then
  echo "Installation de uv…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
exec uv run --project backend readitforme
