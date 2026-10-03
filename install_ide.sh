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

  url="https://github.com/supernovalang/snova-lsp/archive/refs/heads/master.zip"
  zip_file="/tmp/snova-lsp.zip"
  tmp_dir="/tmp/snova-lsp-extract"
  install_dir="$HOME/.local/bin"

  echo "Downloading LSP from $url..."
  curl -fsSL "$url" -o "$zip_file"

  echo "Extracting LSP..."
  rm -rf "$tmp_dir"
  mkdir -p "$tmp_dir"
  unzip -q "$zip_file" -d "$tmp_dir"
  rm "$zip_file"

  # O zip do GitHub extrai para uma subpasta snova-lsp-master/
  extracted=$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -1)
  if [ -z "$extracted" ]; then
    echo "ERROR: Could not find extracted folder in $tmp_dir"
    exit 1
  fi

  # Copia binários para ~/.local/bin (sem sudo)
  mkdir -p "$install_dir"
  cp -r "$extracted/." "$install_dir/"
  rm -rf "$tmp_dir"
  chmod +x "$install_dir/snova-lsp" 2>/dev/null || true

  echo "Snovalang LSP installed to $install_dir"

  # Adiciona ao PATH se necessário
  shell_rc=""
  if [[ -f "$HOME/.zshrc" ]]; then
    shell_rc="$HOME/.zshrc"
  elif [[ -f "$HOME/.bashrc" ]]; then
    shell_rc="$HOME/.bashrc"
  fi

  if [ -n "$shell_rc" ] && ! grep -q "$install_dir" "$shell_rc"; then
    echo "export PATH=\"\$PATH:$install_dir\"" >> "$shell_rc"
    echo "Added $install_dir to PATH in $shell_rc"
    echo "Run: source $shell_rc  (or open a new terminal)"
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
