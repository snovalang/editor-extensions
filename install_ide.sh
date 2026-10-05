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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ $SELECTION == *"vscode"* ]]; then
  echo "Installing Snovalang extension for VS Code..."
  "$SCRIPT_DIR/install-vscode.sh"
fi
if [[ $SELECTION == *"zed"* ]]; then
  echo "Installing Snovalang extension for Zed..."
  "$SCRIPT_DIR/install-zed.sh"
fi

exit 0
