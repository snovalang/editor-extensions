#!/bin/sh
# Install the Snovalang VS Code extension from the latest GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-vscode.sh | sh
#
# The script downloads snovalang.vsix and runs:
#   code --install-extension snovalang.vsix
set -eu

REPO="snovalang/editor-extensions"
URL="${SNOVA_VSCODE_VSIX_URL:-https://github.com/${REPO}/releases/latest/download/snovalang.vsix}"
dest="${TMPDIR:-/tmp}/snovalang.vsix"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download snovalang.vsix" >&2
  exit 1
fi

magic_kind() {
  hex=$(od -An -t x1 -N 4 "$1" 2>/dev/null | tr -d ' \n' | tr 'A-F' 'a-f' || true)
  case "$hex" in
    7f454c46*) echo elf ;;
    4d5a*) echo pe ;;
    cafebabe*|cafebabf*|feedface*|feedfacf*|cefaedfe*|cffaedfe*|bebafeca*|bfbafeca*) echo macho ;;
    *) echo unknown ;;
  esac
}

# Copy the host snova-lsp out of the VSIX into ~/.local/bin (`make install`'s
# directory). The extension also starts the copy inside the VSIX, so a failed
# copy does not fail the install.
install_server_from_vsix() {
  archive=$1
  if [ -z "${HOME:-}" ]; then
    echo "HOME is not set; the extension still starts the bundled snova-lsp." >&2
    return 1
  fi
  stage=$(mktemp -d)
  extracted=0
  if command -v python3 >/dev/null 2>&1; then
    if python3 - "$archive" "$stage" << 'PY'
import os, sys, zipfile
archive, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
found = False
with zipfile.ZipFile(archive) as zf:
    for name in zf.namelist():
        base = name.rsplit("/", 1)[-1]
        if name.startswith("extension/server/") and base.startswith("snova-lsp"):
            target = os.path.join(out, base)
            with zf.open(name) as src, open(target, "wb") as dst:
                dst.write(src.read())
            os.chmod(target, 0o755)
            found = True
sys.exit(0 if found else 1)
PY
    then
      extracted=1
    fi
  elif command -v unzip >/dev/null 2>&1; then
    if unzip -o -j "$archive" "extension/server/snova-lsp*" -d "$stage" >/dev/null; then
      extracted=1
    fi
  fi
  if [ "$extracted" -ne 1 ]; then
    rm -rf "$stage"
    return 1
  fi
  case "$(uname -s)" in
    Darwin) srcname=snova-lsp-darwin; expect=macho; destname=snova-lsp ;;
    Linux) srcname=snova-lsp; expect=elf; destname=snova-lsp ;;
    MINGW*|MSYS*|CYGWIN*) srcname=snova-lsp.exe; expect=pe; destname=snova-lsp.exe ;;
    *) rm -rf "$stage"; return 1 ;;
  esac
  src="$stage/$srcname"
  kind=$(magic_kind "$src")
  if [ ! -f "$src" ] || [ "$kind" != "$expect" ]; then
    rm -rf "$stage"
    return 1
  fi
  mkdir -p "$HOME/.local/bin"
  cp "$src" "$HOME/.local/bin/$destname"
  chmod 755 "$HOME/.local/bin/$destname"
  if [ "$expect" != pe ]; then
    ln -sfn "$destname" "$HOME/.local/bin/snovalang-lsp"
  fi
  rm -rf "$stage"
  echo "Installed snova-lsp to $HOME/.local/bin/$destname"
}

echo "Downloading $URL"
if ! curl -fL --retry 3 -o "$dest" "$URL"; then
  echo "Could not download snovalang.vsix from $URL" >&2
  echo "The latest GitHub release must include the snovalang.vsix asset." >&2
  exit 1
fi

if ! install_server_from_vsix "$dest"; then
  echo "Could not copy snova-lsp to ~/.local/bin. The extension still starts the server bundled in the VSIX when that binary matches this system." >&2
fi

cli="${VSCODE_CLI:-}"
if [ -z "$cli" ]; then
  if command -v code >/dev/null 2>&1; then
    cli="code"
  fi
fi

if [ -z "$cli" ]; then
  echo "Saved $dest"
  echo "The \`code\` command is not on PATH. In VS Code, run \"Extensions: Install from VSIX...\" and select that file." >&2
  echo "Or install the shell command, then run: code --install-extension \"$dest\"" >&2
  exit 1
fi

echo "Running $cli --install-extension $dest"
"$cli" --install-extension "$dest"
echo "Snovalang is installed. Reload the window if the editor was already open."
echo "Diagnostics, completion, and navigation come from snova-lsp."
