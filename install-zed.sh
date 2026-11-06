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
package="$tmp/snovalang"
case "$(uname -s)" in
  Darwin) server="" ;;
  Linux) server="$package/server/snova-lsp" ;;
  MINGW*|MSYS*|CYGWIN*) server="$package/server/snova-lsp.exe" ;;
  *) echo "Unsupported operating system: $(uname -s)" >&2; exit 1 ;;
esac
magic_kind() {
  hex=$(od -An -t x1 -N 4 "$1" 2>/dev/null | tr -d ' \n' | tr 'A-F' 'a-f' || true)
  case "$hex" in
    7f454c46*) echo elf ;;
    4d5a*) echo pe ;;
    cafebabe*|cafebabf*|feedface*|feedfacf*|cefaedfe*|cffaedfe*|bebafeca*|bfbafeca*) echo macho ;;
    *) echo unknown ;;
  esac
}
check_archive_file() {
  file=$1
  if [ ! -f "$file" ]; then
    echo "Archive is incomplete; missing ${file#"$tmp"/}" >&2
    exit 1
  fi
}
check_archive_file "$package/extension.toml"
check_archive_file "$package/extension.wasm"
check_archive_file "$package/icon_themes/snovalang-icons.json"
check_archive_file "$package/icons/snovalang-dark.png"
check_archive_file "$package/icons/snovalang-light.png"
for icon in \
  "$package/icon_themes/snovalang-icons.json" \
  "$package/icons/snovalang-dark.png" \
  "$package/icons/snovalang-light.png"; do
  if [ ! -s "$icon" ]; then
    echo "Archive contains an empty icon asset: ${icon#"$tmp"/}" >&2
    exit 1
  fi
done
check_archive_file "$package/grammars/snovalang.wasm"
check_archive_file "$package/grammars/snovalang_manifest.wasm"
check_archive_file "$package/languages/snovalang/config.toml"
check_archive_file "$package/languages/snovalang_manifest/config.toml"

case "$(uname -s)" in
  Darwin)
    expected_kind=macho
    for candidate in "$package/server/snova-lsp-darwin" "$package/server/snova-lsp"; do
      if [ -f "$candidate" ] && [ "$(magic_kind "$candidate")" = macho ]; then
        server="$candidate"
        break
      fi
    done
    ;;
  Linux) expected_kind=elf ;;
  *) expected_kind=pe ;;
esac
if [ -n "$server" ]; then
  check_archive_file "$server"
  actual_kind=$(magic_kind "$server")
  if [ "$actual_kind" != "$expected_kind" ]; then
    echo "Archive has the wrong server binary for this system ($actual_kind; expected $expected_kind)." >&2
    exit 1
  fi
elif [ "$(uname -s)" != Darwin ]; then
  echo "Archive has no server binary for this system." >&2
  exit 1
fi

if [ ! -s "$package/extension.wasm" ]; then
  echo "Archive contains an empty extension.wasm" >&2
  exit 1
fi

mkdir -p "$ext_root/installed"
backup="$installed.backup.$$"
if [ -e "$installed" ]; then
  mv "$installed" "$backup"
fi
if ! mv "$package" "$installed"; then
  if [ -e "$backup" ]; then mv "$backup" "$installed"; fi
  echo "Could not move the validated extension into $installed" >&2
  exit 1
fi
rm -rf "$backup"
rm -f "$ext_root/index.json"

copy_server_into_local_bin() {
  root=$1
  if [ -z "${HOME:-}" ]; then
    return 1
  fi
  src=""
  srcname=""
  case "$(uname -s)" in
    Darwin)
      expect=macho
      destname=snova-lsp
      srcname=snova-lsp-darwin
      src="$root/server/snova-lsp-darwin"
      if [ ! -f "$src" ] || [ "$(magic_kind "$src")" != macho ]; then
        srcname=snova-lsp
        src="$root/server/snova-lsp"
      fi
      ;;
    Linux) srcname=snova-lsp; expect=elf; destname=snova-lsp ;;
    MINGW*|MSYS*|CYGWIN*) srcname=snova-lsp.exe; expect=pe; destname=snova-lsp.exe ;;
    *) return 1 ;;
  esac
  if [ -z "${src:-}" ]; then src="$root/server/$srcname"; fi
  if [ ! -f "$src" ]; then
    if [ "$(uname -s)" = Darwin ]; then
      echo "No compatible bundled macOS language server was found; Zed will use ~/.local/bin/snova-lsp if available or install one when a Snovalang file is opened." >&2
    else
      echo "The extension archive has no server/$srcname." >&2
    fi
    return 1
  fi
  kind=$(magic_kind "$src")
  if [ "$kind" != "$expect" ]; then
    echo "Skipping server/$srcname (header is $kind, want $expect)." >&2
    return 1
  fi
  mkdir -p "$HOME/.local/bin"
  cp "$src" "$HOME/.local/bin/$destname"
  chmod 755 "$HOME/.local/bin/$destname"
  if [ "$expect" != pe ]; then
    ln -sfn "$destname" "$HOME/.local/bin/snovalang-lsp"
  fi
  echo "Installed snova-lsp to $HOME/.local/bin/$destname"
}

copy_server_into_local_bin "$installed" || true

echo "Installed Snovalang to $installed"
echo "Restart Zed, or run \"zed: reload extensions\" from the command palette."
