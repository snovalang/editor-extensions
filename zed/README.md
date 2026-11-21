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

The extension checks GitHub for the latest editor release and downloads the standalone LSP binary into Zed's extension work directory. Zed reuses one server process per worktree; the extension checks for updates every six hours and when the server starts. If GitHub downloads are unavailable, it falls back to `snova-lsp` on the worktree's `PATH`. The LSP writes protocol traces to `.snova-lsp.log` in the worktree root. The extension archive does not bundle the language server.

The automatic download requires Zed's `download_file` capability for GitHub release assets. If downloads are restricted, allow `github.com/snovalang/editor-extensions/releases/download/**` in `granted_extension_capabilities` or install `snova-lsp` on `PATH`.

`.snl` is Snovalang source and `.sns` is a Snovalang script. `mod.sns`, `snova.sns`, `snova.mod`, `snova.toml`, and `Snovalang.toml` are project manifests. Diagnostics, completion, hover, and navigation come from `snova-lsp`.

## Features

- Highlights, brackets, indents, and outline queries
- Language server auto-install/update from the latest platform binary on GitHub, with a `PATH` fallback
- Explicit LSP `languageId` mapping (`snova` / `snova-manifest`) and file trace logs
- Semantic-token style rules for source and manifest code; enable `"semantic_tokens": "combined"` in Zed settings

## Developing

Run **zed: install dev extension** and select this directory. Zed compiles the extension for `wasm32-wasip2`. Grammar sources are loaded from the `repository`, `path`, and `rev` entries in `extension.toml`.

`../scripts/package-zed.sh` builds the release archive. On Windows, `build.ps1` is the local packaging helper when the MSVC linker cannot find `msvcrt.lib`.
