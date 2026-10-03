#!/bin/sh
# Build dist/snovalang.vsix from vscode/. The VSIX is what
# install-vscode.sh and `code --install-extension` install.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/dist" "$ROOT/vscode/server"

# Prefer a freshly built sibling server. A binary already in vscode/server/
# is what the VSIX ships when this repo is packaged on its own.
if [ -n "${SNOVA_LSP_BIN:-}" ] && [ -f "$SNOVA_LSP_BIN" ]; then
  cp "$SNOVA_LSP_BIN" "$ROOT/vscode/server/snova-lsp"
  chmod 755 "$ROOT/vscode/server/snova-lsp"
elif [ -f "$ROOT/../snova-lsp/build/snova-lsp" ]; then
  cp "$ROOT/../snova-lsp/build/snova-lsp" "$ROOT/vscode/server/snova-lsp"
  chmod 755 "$ROOT/vscode/server/snova-lsp"
fi
if [ -n "${SNOVA_LSP_WIN_BIN:-}" ] && [ -f "$SNOVA_LSP_WIN_BIN" ]; then
  cp "$SNOVA_LSP_WIN_BIN" "$ROOT/vscode/server/snova-lsp.exe"
elif [ -f "$ROOT/../snova-lsp/tools/bin/snova-lsp.exe" ]; then
  cp "$ROOT/../snova-lsp/tools/bin/snova-lsp.exe" "$ROOT/vscode/server/snova-lsp.exe"
fi

if [ ! -f "$ROOT/vscode/server/snova-lsp" ] && [ ! -f "$ROOT/vscode/server/snova-lsp.exe" ]; then
  echo "snovalang.vsix needs vscode/server/snova-lsp or snova-lsp.exe" >&2
  exit 1
fi

cd "$ROOT/vscode"
npm ci
npx --yes @vscode/vsce package -o "$ROOT/dist/snovalang.vsix"

if ! unzip -l "$ROOT/dist/snovalang.vsix" | grep -q "extension/out/extension.js"; then
  echo "snovalang.vsix is missing extension/out/extension.js" >&2
  exit 1
fi
listing=$(unzip -Z1 "$ROOT/dist/snovalang.vsix")
printf '%s\n' "$listing" | grep -qx 'extension/server/snova-lsp' || {
  echo "snovalang.vsix is missing extension/server/snova-lsp" >&2
  exit 1
}
printf '%s\n' "$listing" | grep -qx 'extension/server/snova-lsp.exe' || {
  echo "snovalang.vsix is missing extension/server/snova-lsp.exe" >&2
  exit 1
}

echo "Built $ROOT/dist/snovalang.vsix"
