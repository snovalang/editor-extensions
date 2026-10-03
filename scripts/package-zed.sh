#!/bin/sh
# Build dist/snovalang-zed.tar.gz, the archive install-zed.sh extracts into
# Zed's installed-extensions directory. Layout matches a gallery install:
# extension.toml, extension.wasm, grammars/*.wasm, languages/.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ZED="$ROOT/zed"
DIST="$ROOT/dist"
PKG="$DIST/snovalang"
WASI_SDK_VERSION="25"
WASI_SDK_RELEASE="wasi-sdk-25"
CACHE="${SNOVA_WASI_SDK_CACHE:-$ROOT/.cache/wasi-sdk}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required tool: $1" >&2
    exit 1
  }
}

need cargo
need rustup
need curl
need tar

os=$(uname -s)
arch=$(uname -m)
case "$os-$arch" in
  Linux-x86_64) asset="${WASI_SDK_RELEASE}.0-x86_64-linux.tar.gz" ;;
  Linux-aarch64|Linux-arm64) asset="${WASI_SDK_RELEASE}.0-arm64-linux.tar.gz" ;;
  Darwin-x86_64) asset="${WASI_SDK_RELEASE}.0-x86_64-macos.tar.gz" ;;
  Darwin-arm64|Darwin-aarch64) asset="${WASI_SDK_RELEASE}.0-arm64-macos.tar.gz" ;;
  *)
    echo "wasi-sdk is not available for $os-$arch" >&2
    exit 1
    ;;
esac

if [ ! -x "$CACHE/bin/clang" ]; then
  echo "Downloading wasi-sdk $WASI_SDK_VERSION ($asset)"
  tmp=$(mktemp -d)
  curl -fsSL "https://github.com/WebAssembly/wasi-sdk/releases/download/${WASI_SDK_RELEASE}/${asset}" -o "$tmp/wasi-sdk.tar.gz"
  tar -xzf "$tmp/wasi-sdk.tar.gz" -C "$tmp"
  extracted=$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -1)
  rm -rf "$CACHE"
  mkdir -p "$(dirname "$CACHE")"
  mv "$extracted" "$CACHE"
  rm -rf "$tmp"
fi

CLANG="$CACHE/bin/clang"
if [ ! -x "$CLANG" ]; then
  echo "clang not found in $CACHE" >&2
  exit 1
fi

echo "Adding wasm32-wasip2 target"
( cd "$ZED" && rustup target add wasm32-wasip2 >/dev/null )

echo "Building Zed extension component"
(
  cd "$ZED"
  cargo build --release --locked --target wasm32-wasip2
)

wasm="$ZED/target/wasm32-wasip2/release/zed_snovalang.wasm"
if [ ! -f "$wasm" ]; then
  echo "missing Rust component: $wasm" >&2
  exit 1
fi
if ! grep -a -q "zed:api-version" "$wasm"; then
  echo "extension wasm is missing the zed:api-version section" >&2
  exit 1
fi

rm -rf "$PKG"
mkdir -p "$PKG/grammars" "$PKG/languages"

compile_grammar() {
  name="$1"
  src="$2"
  out="$PKG/grammars/${name}.wasm"
  echo "Compiling grammar $name"
  if [ -f "$src/scanner.c" ]; then
    "$CLANG" -fPIC -shared -Os \
      "-Wl,--export=tree_sitter_${name}" \
      "-Wl,--export=tree_sitter_${name}_external_scanner_create" \
      "-Wl,--export=tree_sitter_${name}_external_scanner_destroy" \
      "-Wl,--export=tree_sitter_${name}_external_scanner_serialize" \
      "-Wl,--export=tree_sitter_${name}_external_scanner_deserialize" \
      "-Wl,--export=tree_sitter_${name}_external_scanner_scan" \
      -o "$out" -I "$src" "$src/parser.c" "$src/scanner.c"
  else
    "$CLANG" -fPIC -shared -Os \
      "-Wl,--export=tree_sitter_${name}" \
      -o "$out" -I "$src" "$src/parser.c"
  fi
  if ! grep -a -q "tree_sitter_${name}" "$out"; then
    echo "grammar wasm $out is missing tree_sitter_${name}" >&2
    exit 1
  fi
}

compile_grammar snovalang "$ZED/tree-sitter-snovalang/src"
compile_grammar snovalang_manifest "$ZED/tree-sitter-snovalang-manifest/src"

cp "$ZED/extension.toml" "$PKG/extension.toml"
cp "$wasm" "$PKG/extension.wasm"
cp -R "$ZED/languages/snovalang" "$PKG/languages/snovalang"
cp -R "$ZED/languages/snovalang_manifest" "$PKG/languages/snovalang_manifest"

tarball="$DIST/snovalang-zed.tar.gz"
tar -czf "$tarball" -C "$DIST" snovalang
echo "Built $tarball"
tar -tzf "$tarball"
