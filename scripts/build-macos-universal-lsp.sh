#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
LSP_COMMIT=$(tr -d ' \n\r\t' < "$ROOT/scripts/snova-lsp-commit.txt")
TMP_ROOT=${RUNNER_TEMP:-${TMPDIR:-/tmp}}
SOURCE_DIR=$(mktemp -d "$TMP_ROOT/snova-lsp-macos.XXXXXX")
trap 'rm -rf "$SOURCE_DIR"' EXIT HUP INT TERM

git clone --no-checkout --filter=blob:none https://github.com/snovalang/snova-lsp.git "$SOURCE_DIR/source"
git -C "$SOURCE_DIR/source" fetch --depth 1 origin "$LSP_COMMIT"
git -C "$SOURCE_DIR/source" checkout --detach FETCH_HEAD

for arch in x86_64 arm64; do
  make -C "$SOURCE_DIR/source" \
    BUILD="build-$arch" \
    SNOVAC_DIR="build-$arch/deps/snovac" \
    CC="clang -arch $arch"
done

lipo -create \
  "$SOURCE_DIR/source/build-x86_64/snova-lsp" \
  "$SOURCE_DIR/source/build-arm64/snova-lsp" \
  -output "$ROOT/vscode/server/snova-lsp-darwin"
chmod 755 "$ROOT/vscode/server/snova-lsp-darwin"
file "$ROOT/vscode/server/snova-lsp-darwin" | grep -q 'Mach-O universal'
echo "Built universal macOS snova-lsp from $LSP_COMMIT: $ROOT/vscode/server/snova-lsp-darwin"
