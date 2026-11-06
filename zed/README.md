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

The script downloads [`snovalang-zed.tar.gz`](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang-zed.tar.gz) from the latest GitHub release, installs the prebuilt extension (`extension.wasm`, grammar WebAssembly, language queries, and Snovalang icon theme), and attempts to build the current default-branch `snova-lsp` into `~/.local/bin`. Restart Zed, or run **zed: reload extensions**.

The extension starts `snova-lsp` when a Snovalang file is opened. It prefers `~/.local/bin/snova-lsp`, which the installer refreshes from the latest default branch of [snova-lsp](https://github.com/snovalang/snova-lsp), then uses the bundled host binary or a `snova-lsp` on `PATH`. If the latest build cannot run, the installer keeps a host-compatible bundled fallback. One process is reused for the worktree. The server speaks stdio and needs no extra arguments.

`.snl` is Snovalang source and `.sns` is a Snovalang script. `mod.sns`, `snova.sns`, `snova.mod`, `snova.toml`, and `Snovalang.toml` are project manifests. Diagnostics, completion, hover, and navigation come from `snova-lsp`.

## Features

- Highlights, brackets, indents, and outline queries
- Language server command for `snova-lsp` over stdio
- `.snl` file icon from the Snovalang language dev extension

## Development icon

Run **zed: install dev extension** and select `zed/`. Then run **icon theme selector: toggle** and choose **Snovalang Icons**. The theme maps `.snl` files to the high-contrast Snovalang symbol.

## Developing

Run **zed: install dev extension** and select this directory. Zed compiles the extension. Grammar sources are loaded from the `repository`, `path`, and `rev` entries in `extension.toml`.

`../scripts/package-zed.sh` builds the release archive. On Windows, `build.ps1` is the local packaging helper when the MSVC linker cannot find `msvcrt.lib`.
