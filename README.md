# Snovalang Editor Extensions

Syntax highlighting, snippets, and language-server support for Snovalang in VS Code and Zed.

Diagnostics, hover, completion, signature help, and navigation come from [snova-lsp](https://github.com/snovalang/snova-lsp). Each editor starts one server process per workspace, in the background, when a Snovalang file is opened. Run and check actions still call the installed compiler command, `snl`.

The extension ships fallback server binaries: Linux ELF `snova-lsp`, Windows `snova-lsp.exe`, and universal Mach-O `snova-lsp-darwin`. The Zed installation script attempts a fresh shallow clone and build of the current default branch of `snova-lsp` and installs it to `~/.local/bin`; Zed prefers that installed server over the bundled fallback. If the update cannot be built, the installer keeps or installs a host-compatible bundled binary. On macOS the extension starts the universal Mach-O binary and does not launch the Linux or Windows executable.

## VS Code

Linux and macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-vscode.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-vscode.ps1 | iex
```

Both scripts download `snovalang.vsix` from the latest GitHub release and install it with:

```sh
code --install-extension snovalang.vsix
```

From the editor, download [snovalang.vsix](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang.vsix) and run **Extensions: Install from VSIX...**.

The release workflow publishes that same VSIX to the Visual Studio Marketplace and Open VSX when the `VSCE_PAT` and `OVSX_PAT` repository secrets are set. The VSIX command above is the install path that works without those secrets.

## Zed

Linux and macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-zed.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-zed.ps1 | iex
```

Both scripts download [snovalang-zed.tar.gz](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang-zed.tar.gz) and extract it into Zed's installed-extensions directory (`~/.local/share/zed/extensions/installed/snovalang` on Linux, `~/Library/Application Support/Zed/extensions/installed/snovalang` on macOS, `%LOCALAPPDATA%\Zed\extensions\installed\snovalang` on Windows). Restart Zed, or run **zed: reload extensions**.

After the extension is accepted into the [Zed extension repository](https://github.com/zed-industries/extensions), it also appears in the Extensions gallery. The release archive is the install path that works before that listing exists.

## Extensions

### VS Code ([`vscode/`](vscode/))

- TextMate highlighting for `.snl` sources and `.sns` scripts
- Snovalang symbol as the language icon for `.snl` and `.sns` files when the active VS Code file icon theme does not provide its own
- Manifest highlighting for `mod.sns` and `snova.sns`
- Bundled language server: Linux ELF `snova-lsp`, Windows `snova-lsp.exe`, and universal Mach-O `snova-lsp-darwin`
- When no compatible binary is present, `snova.lsp.autoInstall` (default on) runs `make install` from [snova-lsp](https://github.com/snovalang/snova-lsp) into `~/.local/bin`
- Snippets (`func`, `method`, `class`, `data class`, `extension`, `struct`, `enum`, `match`, `for`, `pulsar`)
- Language configuration (brackets and auto-closing pairs)
- One stdio language client for `snova-lsp` per window. Features follow the server's initialize result (full-document sync, diagnostics, completion, hover, definition, references, symbols, signature help, code actions, semantic tokens)
- **Snovalang: Run Current File** runs `snl run`
- **Snovalang: Check Current File** runs `snl check`
- **Snovalang: Check Project** runs `snl check --project`
- **Snovalang: Tidy Dependencies** runs `snl tidy`
- **Snovalang: Get Dependencies** runs `snl get`

### Zed ([`zed/`](zed/))

- Tree-sitter highlighting, brackets, indents, and outline
- One `snova-lsp` process per worktree, preferring the latest server installed in `~/.local/bin` and falling back to the bundled host binary
- A `Snovalang Icons` theme inside the language dev extension provides the `.snl` file icon. Install `zed/` with **zed: install dev extension**, then select **Snovalang Icons** in the icon theme selector.

## Developing

Clone this repository to change the extensions.

```sh
./scripts/package-vscode.sh   # writes dist/snovalang.vsix
./scripts/package-zed.sh      # writes dist/snovalang-zed.tar.gz
```

Pushing a tag `vX.Y.Z` runs the release workflow, which attaches those two files to the GitHub release.

VS Code development: `cd vscode && npm ci && npm run compile`.

Zed development: in Zed, run **zed: install dev extension** and select the `zed/` directory, then choose **Snovalang Icons** in the icon theme selector. Grammar revisions are the `rev` fields in `zed/extension.toml`. On Windows, if the host linker reports `msvcrt.lib` missing, build with the GNU toolchain (`zed/build.ps1`).

`install_ide.sh` and `install_ide.ps1` are an optional checklist. They call the same release installers.

## License

This project is licensed under the [Apache License, Version 2.0](LICENSE).
Copyright 2026 Snovalang contributors. See [NOTICE](NOTICE).
