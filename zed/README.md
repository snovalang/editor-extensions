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

Install [snova-lsp](https://github.com/snovalang/snova-lsp) separately and ensure `snova-lsp` is on the worktree's `PATH`. The extension resolves the executable through Zed's `Worktree::which` API and starts it over stdio with no extra arguments. Zed reuses one server process per worktree. The extension archive does not bundle the language server.

`.snl` is Snovalang source and `.sns` is a Snovalang script. `mod.sns`, `snova.sns`, `snova.mod`, `snova.toml`, and `Snovalang.toml` are project manifests. Diagnostics, completion, hover, and navigation come from `snova-lsp`.

## Features

- Highlights, brackets, indents, and outline queries
- Language server command for `snova-lsp` over stdio, discovered on `PATH`

## Developing

Run **zed: install dev extension** and select this directory. Zed compiles the extension for `wasm32-wasip2`. Grammar sources are loaded from the `repository`, `path`, and `rev` entries in `extension.toml`.

`../scripts/package-zed.sh` builds the release archive. On Windows, `build.ps1` is the local packaging helper when the MSVC linker cannot find `msvcrt.lib`.
