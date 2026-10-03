# Snovalang — Zed extension

Syntax highlighting and `snova-lsp` integration for Zed.

## Install

Linux and macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-zed.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-zed.ps1 | iex
```

The script downloads [`snovalang-zed.tar.gz`](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang-zed.tar.gz) from the latest GitHub release and installs the prebuilt extension (`extension.wasm`, grammar WebAssembly, and language queries). Restart Zed, or run **zed: reload extensions**.

`snova-lsp` must be on `PATH` for diagnostics, hover, and completion. The extension treats `.snl` as Snovalang source and `.sns` as a Snovalang script.

## Features

- Highlights, brackets, indents, and outline queries
- Language server command for `snova-lsp` (`--stdio`)

## Developing

Run **zed: install dev extension** and select this directory. Zed compiles the extension. Grammar sources are loaded from the `repository`, `path`, and `rev` entries in `extension.toml`.

`../scripts/package-zed.sh` builds the release archive. On Windows, `build.ps1` is the local packaging helper when the MSVC linker cannot find `msvcrt.lib`.
