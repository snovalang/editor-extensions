#!/bin/sh
# Install the prebuilt Snovalang Zed extension from the latest GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-zed.sh | sh
#
# Extracts snovalang-zed.tar.gz into Zed's installed-extensions directory.
set -eu

REPO="snovalang/editor-extensions"
URL="${SNOVA_ZED_URL:-https://github.com/${REPO}/releases/latest/download/snovalang-zed.tar.gz}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download snovalang-zed.tar.gz" >&2
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "tar is required to extract snovalang-zed.tar.gz" >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin)
    ext_root="$HOME/Library/Application Support/Zed/extensions"
    ;;
  Linux)
    ext_root="${XDG_DATA_HOME:-$HOME/.local/share}/zed/extensions"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    if [ -n "${LOCALAPPDATA:-}" ]; then
      ext_root="$LOCALAPPDATA/Zed/extensions"
    else
      ext_root="$HOME/AppData/Local/Zed/extensions"
    fi
    ;;
  *)
    echo "Unsupported operating system: $(uname -s)" >&2
    exit 1
    ;;
esac

installed="$ext_root/installed/snovalang"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $URL"
if ! curl -fL --retry 3 -o "$tmp/snovalang-zed.tar.gz" "$URL"; then
  echo "Could not download snovalang-zed.tar.gz from $URL" >&2
  echo "The latest GitHub release must include the snovalang-zed.tar.gz asset." >&2
  exit 1
fi

tar -xzf "$tmp/snovalang-zed.tar.gz" -C "$tmp"
if [ ! -f "$tmp/snovalang/extension.toml" ] || [ ! -f "$tmp/snovalang/extension.wasm" ]; then
  echo "Archive is missing snovalang/extension.toml or snovalang/extension.wasm" >&2
  exit 1
fi

mkdir -p "$ext_root/installed"
rm -rf "$installed"
mv "$tmp/snovalang" "$installed"
rm -f "$ext_root/index.json"

echo "Installed Snovalang to $installed"
echo "Restart Zed, or run \"zed: reload extensions\" from the command palette."
