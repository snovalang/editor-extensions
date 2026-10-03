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

echo "Downloading $URL"
if ! curl -fL --retry 3 -o "$dest" "$URL"; then
  echo "Could not download snovalang.vsix from $URL" >&2
  echo "The latest GitHub release must include the snovalang.vsix asset." >&2
  exit 1
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
