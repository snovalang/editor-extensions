#!/bin/sh
# Install snova-lsp into ~/.local/bin, the directory `make install` uses
# (PREFIX=$HOME/.local).
#
# A host-matching binary is copied when SNOVA_LSP_BIN or SNOVA_LSP_BUNDLE_DIR
# points at one, or when vscode/server next to this repo has one. Otherwise
# the script clones https://github.com/snovalang/snova-lsp (and snovac) and
# runs `make install`. Set SNOVA_LSP_NO_BUILD=1 to refuse that compile.
#
#   SNOVA_LSP_BIN          file to install
#   SNOVA_LSP_BUNDLE_DIR   directory of snova-lsp, snova-lsp-darwin, snova-lsp.exe
#   SNOVA_LSP_CHECKOUT     existing snova-lsp checkout (Makefile + src/lsp_transport.c)
#   SNOVA_LSP_NO_BUILD     if set, do not clone or compile
#   SNOVA_LSP_FORCE_LATEST if 1, ignore all local/bundled copies and clone fresh
#                          default-branch checkouts of snova-lsp and snovac
#   SNOVA_LSP_ASSUME_HOST  darwin, linux, or win32 (tests)
#   SNOVA_LSP_ASSUME_ARCH  x64, arm64, ia32, or unknown (tests)
#   PREFIX                 default $HOME/.local
set -eu

prefix="${PREFIX:-${HOME:-}/.local}"
bindir="$prefix/bin"

if [ -z "${HOME:-}" ] && [ -z "${PREFIX:-}" ]; then
  echo "HOME is not set" >&2
  exit 1
fi

host="${SNOVA_LSP_ASSUME_HOST:-}"
if [ -z "$host" ]; then
  case "$(uname -s)" in
    Darwin) host=darwin ;;
    Linux) host=linux ;;
    MINGW*|MSYS*|CYGWIN*) host=win32 ;;
    *)
      echo "Unsupported operating system: $(uname -s)" >&2
      exit 1
      ;;
  esac
fi

arch="${SNOVA_LSP_ASSUME_ARCH:-}"
if [ -z "$arch" ]; then
  case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    i386|i686) arch=ia32 ;;
    *) arch=unknown ;;
  esac
fi

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)

header_matches() {
  file=$1
  if [ ! -f "$file" ]; then
    return 1
  fi
  if command -v python3 >/dev/null 2>&1; then
    if python3 - "$file" "$host" "$arch" << 'PY'
import sys
path, host, arch = sys.argv[1], sys.argv[2], sys.argv[3]
data = open(path, "rb").read(256)

def u16(buf, off, little):
    if off + 2 > len(buf):
        return None
    b0, b1 = buf[off], buf[off + 1]
    return b0 | (b1 << 8) if little else (b0 << 8) | b1

def u32(buf, off, little):
    if off + 4 > len(buf):
        return None
    b0, b1, b2, b3 = buf[off:off + 4]
    if little:
        return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
    return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3

def macho_cpu(cputype):
    base = cputype & 0xFF
    abi64 = cputype & 0x01000000
    if base == 7:
        return "x64" if abi64 else "ia32"
    if base == 12 and abi64:
        return "arm64"
    return None

cpus = None
kind = "unknown"
if data[:4] == b"\x7fELF":
    kind = "elf"
    if len(data) >= 20 and data[5] in (1, 2):
        machine = u16(data, 18, data[5] == 1)
        if machine:
            cpus = {"3": "ia32", "62": "x64", "183": "arm64"}.get(str(machine))
            cpus = [cpus] if cpus else []
elif data[:2] == b"MZ":
    kind = "pe"
    if len(data) >= 0x40:
        lfanew = u32(data, 0x3C, True)
        if lfanew and lfanew + 6 <= len(data) and data[lfanew:lfanew + 4] == b"PE\x00\x00":
            machine = u16(data, lfanew + 4, True)
            if machine:
                cpus = {0x14C: "ia32", 0x8664: "x64", 0xAA64: "arm64"}.get(machine)
                cpus = [cpus] if cpus else []
else:
    magic = u32(data, 0, False)
    machos = {0xFEEDFACE, 0xCEFAEDFE, 0xFEEDFACF, 0xCFFAEDFE, 0xCAFEBABE, 0xBEBAFECA, 0xCAFEBABF, 0xBFBAFECA}
    if magic in machos:
        kind = "macho"
        if magic in (0xCAFEBABE, 0xCAFEBABF):
            count = u32(data, 4, False) or 0
            found = []
            for i in range(min(count, 16)):
                cputype = u32(data, 8 + i * 20, False)
                if cputype is None:
                    break
                cpu = macho_cpu(cputype)
                if cpu and cpu not in found:
                    found.append(cpu)
            if found:
                cpus = found
        else:
            little = magic in (0xCEFAEDFE, 0xCFFAEDFE)
            cputype = u32(data, 4, little)
            if cputype is not None:
                cpu = macho_cpu(cputype)
                if cpu:
                    cpus = [cpu]

need = {"darwin": "macho", "linux": "elf", "win32": "pe"}.get(host)
if kind != need:
    sys.exit(1)
if arch != "unknown" and cpus is not None and arch not in cpus:
    sys.exit(1)
sys.exit(0)
PY
    then
      return 0
    fi
    return 1
  fi
  hex=$(od -An -t x1 -N 4 "$file" 2>/dev/null | tr -d ' \n' | tr 'A-F' 'a-f' || true)
  case "$hex" in
    7f454c46*) kind=elf ;;
    4d5a*) kind=pe ;;
    cafebabe*|cafebabf*|feedface*|feedfacf*|cefaedfe*|cffaedfe*|bebafeca*|bfbafeca*) kind=macho ;;
    *) kind=unknown ;;
  esac
  case "$host" in
    linux) [ "$kind" = elf ] ;;
    darwin) [ "$kind" = macho ] ;;
    win32) [ "$kind" = pe ] ;;
    *) return 1 ;;
  esac
}

install_file() {
  src=$1
  mkdir -p "$bindir"
  case "$host" in
    win32) destname=snova-lsp.exe ;;
    *) destname=snova-lsp ;;
  esac
  cp "$src" "$bindir/$destname"
  chmod 755 "$bindir/$destname"
  if [ "$host" != win32 ]; then
    ln -sfn "$destname" "$bindir/snovalang-lsp"
  fi
  echo "Installed snova-lsp to $bindir/$destname"
}

first_matching() {
  for file in "$@"; do
    if [ -n "$file" ] && [ -f "$file" ] && header_matches "$file"; then
      printf '%s\n' "$file"
      return 0
    fi
  done
  return 1
}

bundle_candidate() {
  dir=$1
  if [ -z "$dir" ] || [ ! -d "$dir" ]; then
    return 1
  fi
  case "$host" in
    darwin) first_matching "$dir/snova-lsp-darwin" "$dir/snova-lsp" ;;
    win32) first_matching "$dir/snova-lsp.exe" ;;
    *) first_matching "$dir/snova-lsp" ;;
  esac
}

is_checkout() {
  [ -f "$1/Makefile" ] && [ -f "$1/src/lsp_transport.c" ]
}

build_checkout() {
  checkout=$1
  parent=$(CDPATH= cd -- "$(dirname "$checkout")" && pwd)
  if [ "${SNOVA_LSP_FORCE_LATEST:-}" = "1" ] && [ -d "$parent/snovac" ]; then
    rm -rf "$parent/snovac"
  fi
  if [ ! -f "$parent/snovac/Makefile" ]; then
    echo "Cloning snovac next to $checkout"
    git clone --depth 1 https://github.com/snovalang/snovac.git "$parent/snovac"
  fi
  echo "Running make install in $checkout"
  make -C "$checkout" install "PREFIX=$prefix" "SNOVAC_DIR=$parent/snovac"
  if [ ! -x "$bindir/snova-lsp" ] && [ ! -f "$bindir/snova-lsp.exe" ]; then
    echo "make install did not write snova-lsp to $bindir" >&2
    return 1
  fi
}

if [ -n "${SNOVA_LSP_BIN:-}" ] && [ "${SNOVA_LSP_FORCE_LATEST:-}" != "1" ]; then
  if header_matches "$SNOVA_LSP_BIN"; then
    install_file "$SNOVA_LSP_BIN"
    exit 0
  fi
  echo "snova-lsp binary does not match this system: $SNOVA_LSP_BIN" >&2
  exit 1
fi

repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
checkout="${SNOVA_LSP_CHECKOUT:-}"
if [ "${SNOVA_LSP_FORCE_LATEST:-}" = "1" ]; then
  checkout=""
elif [ -z "$checkout" ]; then
  for guess in "$repo_root/../snova-lsp" "$repo_root/snova-lsp"; do
    if is_checkout "$guess"; then
      checkout=$guess
      break
    fi
  done
fi

if [ -n "$checkout" ] && is_checkout "$checkout" && [ -z "${SNOVA_LSP_NO_BUILD:-}" ]; then
  if build_checkout "$checkout"; then
    exit 0
  fi
  echo "Build from $checkout failed. Trying a bundled binary." >&2
fi

if [ "${SNOVA_LSP_FORCE_LATEST:-}" != "1" ]; then
  bundled=$(bundle_candidate "${SNOVA_LSP_BUNDLE_DIR:-}" || true)
  if [ -z "$bundled" ]; then
    bundled=$(bundle_candidate "$repo_root/vscode/server" || true)
  fi
  if [ -n "$bundled" ]; then
    install_file "$bundled"
    exit 0
  fi
fi

dest="$bindir/snova-lsp"
if [ "$host" = win32 ]; then
  dest="$bindir/snova-lsp.exe"
fi
if [ "${SNOVA_LSP_FORCE_LATEST:-}" != "1" ] && [ -f "$dest" ] && header_matches "$dest"; then
  echo "snova-lsp is already installed at $dest"
  exit 0
fi

if [ -n "${SNOVA_LSP_NO_BUILD:-}" ]; then
  echo "No snova-lsp binary matches this system, and SNOVA_LSP_NO_BUILD is set." >&2
  exit 1
fi

cache="${XDG_CACHE_HOME:-$HOME/.cache}/snova/src"
mkdir -p "$cache"
if [ "${SNOVA_LSP_FORCE_LATEST:-}" = "1" ]; then
  rm -rf "$cache/snova-lsp"
fi
if ! is_checkout "$cache/snova-lsp"; then
  rm -rf "$cache/snova-lsp"
  git clone --depth 1 https://github.com/snovalang/snova-lsp.git "$cache/snova-lsp"
fi
build_checkout "$cache/snova-lsp"
