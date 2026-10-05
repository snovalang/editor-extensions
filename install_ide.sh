#!/usr/bin/env bash
# install_ide.sh - Interactive IDE setup script
# This script presents a checklist UI for selecting an IDE and the Snovalang LSP.
# Requires "dialog" to be installed (e.g., apt-get install dialog).

OPTIONS=(
  "default" "Default Snovalang LSP" off
  "vscode" "Visual Studio Code" off
  "zed" "Zed" off
)

TMPFILE=$(mktemp)

dialog --clear \
  --title "Choose a setup for your IDE" \
  --checklist "\n-- Toggle options using Space --\n-- Submit on Enter --" \
  15 50 3 \
  "${OPTIONS[@]}" 2> "$TMPFILE"

SELECTION=$(cat "$TMPFILE")
rm -f "$TMPFILE"

if [[ -z $SELECTION ]]; then
  echo "No option selected. Exiting."
  exit 0
fi

print_status() {
  local tag=$1
  local label=$2
  if [[ $SELECTION == *"$tag"* ]]; then
    echo "(x) $label"
  else
    echo "( ) $label"
  fi
}

echo "You selected:"
print_status "default" "Default Snovalang LSP"
print_status "vscode" "Visual Studio Code"
print_status "zed" "Zed"

if [[ $SELECTION == *"default"* ]]; then
  echo "Installing Default Snovalang LSP..."
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  CHECKOUT="$(cd "$SCRIPT_DIR/../snova-lsp" 2>/dev/null && pwd -P || true)"
  INSTALLER=""
  if [ -n "$CHECKOUT" ]; then
    INSTALLER="$CHECKOUT/install.sh"
  fi
  if [ -n "$INSTALLER" ] && [ -f "$INSTALLER" ]; then
    bash "$INSTALLER"
  else
    echo "Local checkout not found. Running the published installer..."
    curl -fsSL https://raw.githubusercontent.com/supernovalang/snova-lsp/master/install.sh | bash
  fi
fi
if [[ $SELECTION == *"vscode"* ]]; then
  echo "Installing Snovalang extension for VS Code..."
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  VSCODE_SRC="$SCRIPT_DIR/vscode"
  json_field() {
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$VSCODE_SRC/package.json" | head -1
  }
  PUBLISHER="$(json_field publisher)"
  NAME="$(json_field name)"
  VERSION="$(json_field version)"
  TARGET="${HOME}/.vscode/extensions/${PUBLISHER}.${NAME}-${VERSION}"
  if [ ! -f "$VSCODE_SRC/out/extension.js" ]; then
    echo "Compiling the VS Code extension..."
    (cd "$VSCODE_SRC" && { [ -d node_modules ] || npm install; } && npx tsc -p .)
  fi
  rm -rf "$TARGET"
  mkdir -p "$TARGET"
  cp "$VSCODE_SRC/package.json" "$VSCODE_SRC/language-configuration.json" "$VSCODE_SRC/README.md" "$TARGET/"
  cp -R "$VSCODE_SRC/out" "$VSCODE_SRC/snippets" "$VSCODE_SRC/syntaxes" "$TARGET/"
  if [ -d "$VSCODE_SRC/node_modules" ]; then
    cp -R "$VSCODE_SRC/node_modules" "$TARGET/"
  fi
  echo "Snovalang extension installed to: $TARGET"
  echo "Restart or reload VS Code to activate."
fi
if [[ $SELECTION == *"zed"* ]]; then
  echo "Installing Snovalang extension for Zed..."

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ZED_EXT_SRC="$SCRIPT_DIR/zed"

  # Determine Zed extensions directory based on OS
  if [[ "$OSTYPE" == "darwin"* ]]; then
    ZED_DIR="$HOME/.config/zed"
  elif [[ -n "${LOCALAPPDATA:-}" ]]; then
    ZED_DIR="${LOCALAPPDATA}/Zed"
  else
    ZED_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/zed"
  fi
  ZED_EXT_DIR="$ZED_DIR/extensions/installed/snovalang"
  ZED_BIN_DIR="$ZED_DIR/tools/bin"

  if [ ! -d "$ZED_EXT_SRC" ]; then
    echo "ERROR: Zed extension source not found at: $ZED_EXT_SRC"
    exit 1
  fi

  # Remove previous installation if exists
  if [ -d "$ZED_EXT_DIR" ]; then
    rm -rf "$ZED_EXT_DIR"
    echo "Removed previous Zed extension installation."
  fi

  # Copy extension files to Zed extensions directory
  mkdir -p "$(dirname "$ZED_EXT_DIR")"
  rm -rf "$ZED_EXT_DIR"
  cp -r "$ZED_EXT_SRC" "$ZED_EXT_DIR"
  mkdir -p "$ZED_BIN_DIR"
  LSP_SOURCE=""
  for candidate in \
    "$SCRIPT_DIR/../snova-lsp/tools/bin/snova-lsp" \
    "$SCRIPT_DIR/../snova-lsp/build/snova-lsp" \
    "${HOME}/.snova/bin/snova-lsp"
  do
    if [ -f "$candidate" ]; then
      dir="$(cd "$(dirname "$candidate")" && pwd -P)"
      LSP_SOURCE="$dir/$(basename "$candidate")"
      break
    fi
  done
  if [ -n "$LSP_SOURCE" ]; then
    rm -f "$ZED_BIN_DIR/snova-lsp"
    cp "$LSP_SOURCE" "$ZED_BIN_DIR/snova-lsp"
    chmod +x "$ZED_BIN_DIR/snova-lsp"
    shell_rc="${HOME}/.profile"
    [ -f "${HOME}/.zshrc" ] && shell_rc="${HOME}/.zshrc"
    if ! grep -Fq "$ZED_BIN_DIR" "$shell_rc" 2>/dev/null; then
      printf '\nexport PATH="$PATH:%s"\n' "$ZED_BIN_DIR" >> "$shell_rc"
    fi
  else
    echo "WARNING: snova-lsp was not found; build snova-lsp first."
  fi
  echo "Snovalang Zed extension installed to: $ZED_EXT_DIR"
  echo ""
  echo "IMPORTANT: Restart Zed and run 'zed: reload extensions' (Cmd/Ctrl+Shift+P) to activate."
fi

exit 0
