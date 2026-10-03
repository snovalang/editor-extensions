#!/bin/sh
# Build dist/snovalang.vsix from vscode/. The VSIX is what
# install-vscode.sh and `code --install-extension` install.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/dist"

cd "$ROOT/vscode"
npm ci
npx --yes @vscode/vsce package -o "$ROOT/dist/snovalang.vsix"

if ! unzip -l "$ROOT/dist/snovalang.vsix" | grep -q "extension/out/extension.js"; then
  echo "snovalang.vsix is missing extension/out/extension.js" >&2
  exit 1
fi

echo "Built $ROOT/dist/snovalang.vsix"
