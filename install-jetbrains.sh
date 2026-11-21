#!/bin/sh
# Install the prebuilt Snovalang plugin from the latest GitHub release into
# every JetBrains IDE 2025.2 or newer found for this user. Restart the IDEs
# afterwards. Open-source IntelliJ IDEA (IdeaIC) and PyCharm CE builds lack the
# LSP API the plugin uses, so they are skipped.
set -eu

REPO="snovalang/editor-extensions"
URL="${SNOVA_JETBRAINS_URL:-https://github.com/${REPO}/releases/latest/download/snovalang-jetbrains.zip}"

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "unzip is required" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) config_root="$HOME/Library/Application Support/JetBrains" ;;
  Linux) config_root="${XDG_CONFIG_HOME:-$HOME/.config}/JetBrains"
         data_root="${XDG_DATA_HOME:-$HOME/.local/share}/JetBrains" ;;
  *) echo "Use install-jetbrains.ps1 on Windows." >&2; exit 1 ;;
esac

[ -d "$config_root" ] || { echo "No JetBrains IDE configuration found in $config_root" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fL --retry 3 -o "$tmp/snovalang-jetbrains.zip" "$URL"
unzip -q "$tmp/snovalang-jetbrains.zip" -d "$tmp/unpacked"
plugin=$(ls "$tmp/unpacked" | head -n 1)
[ -n "$plugin" ] && ls "$tmp/unpacked/$plugin/lib/"*.jar >/dev/null 2>&1 || {
  echo "Archive is incomplete: no plugin jar" >&2; exit 1; }
chmod 755 "$tmp/unpacked/$plugin/server/"* 2>/dev/null || true

count=0
for dir in "$config_root"/*; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  product=$(printf '%s' "$name" | sed -n 's/^\([A-Za-z]*\)20[0-9][0-9]\.[0-9]*$/\1/p')
  [ -n "$product" ] || continue
  case "$product" in IdeaIC|PyCharmCE|AndroidStudio) continue ;; esac
  year=$(printf '%s' "$name" | sed 's/^[A-Za-z]*\(20[0-9][0-9]\)\..*/\1/')
  minor=$(printf '%s' "$name" | sed 's/^.*\.\([0-9]*\)$/\1/')
  [ "$year" -gt 2025 ] || { [ "$year" -eq 2025 ] && [ "$minor" -ge 2 ]; } || continue

  if [ "$(uname -s)" = Darwin ]; then plugins="$dir/plugins"; else plugins="$data_root/$name"; fi
  mkdir -p "$plugins"
  rm -rf "$plugins/$plugin"
  cp -R "$tmp/unpacked/$plugin" "$plugins/$plugin"
  echo "Installed Snovalang into $name ($plugins/$plugin)"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "No JetBrains IDE 2025.2 or newer found. Install the zip with" >&2
  echo "Settings | Plugins | gear icon | Install Plugin from Disk..." >&2
  exit 1
fi
echo "Restart the IDE(s) to load the plugin."
