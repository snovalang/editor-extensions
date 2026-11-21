#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
LSP_COMMIT=$(tr -d ' \n\r\t' < "$ROOT/scripts/snova-lsp-commit.txt")
TMP_ROOT=${RUNNER_TEMP:-${TMPDIR:-/tmp}}
SOURCE_DIR=$(mktemp -d "$TMP_ROOT/snova-lsp-linux.XXXXXX")
trap 'rm -rf "$SOURCE_DIR"' EXIT HUP INT TERM

git clone --no-checkout --filter=blob:none https://github.com/snovalang/snova-lsp.git "$SOURCE_DIR"
git -C "$SOURCE_DIR" fetch --depth 1 origin "$LSP_COMMIT"
git -C "$SOURCE_DIR" checkout --detach FETCH_HEAD
make -C "$SOURCE_DIR" CC="${CC:-cc}"

test -f "$SOURCE_DIR/build/snova-lsp"
file "$SOURCE_DIR/build/snova-lsp" | grep -q ELF
chmod 755 "$SOURCE_DIR/build/snova-lsp"
cp "$SOURCE_DIR/build/snova-lsp" "$ROOT/vscode/server/snova-lsp"
echo "Built Linux snova-lsp from $LSP_COMMIT: $ROOT/vscode/server/snova-lsp"
