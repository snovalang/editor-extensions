#!/bin/sh
# Install the prebuilt Snovalang Zed extension from the latest GitHub release.
set -eu

REPO="snovalang/editor-extensions"
URL="${SNOVA_ZED_URL:-https://github.com/${REPO}/releases/latest/download/snovalang-zed.tar.gz}"

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is required" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) ext_root="$HOME/Library/Application Support/Zed/extensions" ;;
  Linux) ext_root="${XDG_DATA_HOME:-$HOME/.local/share}/zed/extensions" ;;
  MINGW*|MSYS*|CYGWIN*)
    ext_root="${LOCALAPPDATA:-$HOME/AppData/Local}/Zed/extensions" ;;
  *) echo "Unsupported operating system: $(uname -s)" >&2; exit 1 ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fL --retry 3 -o "$tmp/snovalang-zed.tar.gz" "$URL"
tar -xzf "$tmp/snovalang-zed.tar.gz" -C "$tmp"
package="$tmp/snovalang"

for relative in \
  extension.toml extension.wasm \
  grammars/snovalang.wasm grammars/snovalang_manifest.wasm \
  languages/snovalang/config.toml languages/snovalang/highlights.scm \
  languages/snovalang_manifest/config.toml languages/snovalang_manifest/highlights.scm; do
  [ -s "$package/$relative" ] || { echo "Archive is incomplete: $relative" >&2; exit 1; }
done
# Older release archives bundled the language server. Remove that obsolete
# payload during migration; the current extension resolves snova-lsp on PATH.
if [ -d "$package/server" ]; then rm -rf "$package/server"; fi

installed="$ext_root/installed/snovalang"
mkdir -p "$ext_root/installed"
backup="$installed.backup.$$"
if [ -e "$installed" ]; then mv "$installed" "$backup"; fi
if ! mv "$package" "$installed"; then
  [ ! -e "$backup" ] || mv "$backup" "$installed"
  echo "Could not move the validated extension into $installed" >&2
  exit 1
fi
rm -rf "$backup"
rm -f "$ext_root/index.json"

echo "Installed Snovalang to $installed"
echo "Install snova-lsp separately and make sure it is on PATH."
echo "Restart Zed, or run \"zed: reload extensions\" from the command palette."
