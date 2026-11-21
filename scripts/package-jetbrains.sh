#!/bin/sh
# Build dist/snovalang-jetbrains.zip from jetbrains/. The zip is what
# install-jetbrains.sh unpacks and what "Install Plugin from Disk..." accepts.
# It reuses the VS Code TextMate grammars and the snova-lsp binaries in
# vscode/server/, so run package-vscode.sh's binary checks first when those change.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/dist"

for required in snova-lsp snova-lsp.exe snova-lsp-darwin; do
  if [ ! -f "$ROOT/vscode/server/$required" ]; then
    echo "snovalang-jetbrains.zip needs vscode/server/$required" >&2
    exit 1
  fi
done

cd "$ROOT/jetbrains"
./gradlew --no-daemon --console=plain clean buildPlugin

zip=$(ls build/distributions/*.zip | head -n 1)
[ -n "$zip" ] || { echo "buildPlugin produced no zip" >&2; exit 1; }
cp "$zip" "$ROOT/dist/snovalang-jetbrains.zip"

listing=$(unzip -Z1 "$ROOT/dist/snovalang-jetbrains.zip")
top=$(printf '%s\n' "$listing" | head -n 1 | cut -d/ -f1)
for relative in \
  textmate/snovalang/package.json \
  textmate/snovalang/language-configuration.json \
  textmate/snovalang/syntaxes/snovalang.tmLanguage.json \
  textmate/snovalang/syntaxes/snovalang-manifest.tmLanguage.json \
  textmate/snovalang/snippets/snovalang.json \
  server/snova-lsp server/snova-lsp.exe server/snova-lsp-darwin \
  server/builtin/core/types/values/Option.snl; do
  printf '%s\n' "$listing" | grep -qx "$top/$relative" || {
    echo "snovalang-jetbrains.zip is missing $top/$relative" >&2
    exit 1
  }
done
printf '%s\n' "$listing" | grep -q "^$top/lib/.*\.jar$" || {
  echo "snovalang-jetbrains.zip has no plugin jar under $top/lib/" >&2
  exit 1
}

echo "Built $ROOT/dist/snovalang-jetbrains.zip"
