# Snovalang — VS Code Extension

Syntax highlighting, snippets, and a language client for Snovalang.

## Install

Linux and macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-vscode.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-vscode.ps1 | iex
```

The script downloads the latest [`snovalang.vsix`](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang.vsix) and runs `code --install-extension snovalang.vsix`.

From VS Code, download that VSIX and run **Extensions: Install from VSIX...**.

## Use

- Opening a `.snl` or `.sns` file starts `snova-lsp` in the background. One process serves the window. The editor stays responsive while it initializes.
- On macOS the extension starts the universal Mach-O `server/snova-lsp-darwin` and does not launch the Linux ELF or the Windows executable. Linux starts `server/snova-lsp`. Windows starts `server/snova-lsp.exe`.
- A `snova.lsp.serverPath` value other than `snova-lsp` is used only when that file exists and its executable header matches this system.
- When no compatible binary is found and `snova.lsp.autoInstall` is on (the default), the extension clones [snova-lsp](https://github.com/snovalang/snova-lsp) and runs `make install` into `~/.local/bin`. **Snovalang: Install or Update Language Server** does that on demand and keeps the bundled server if the build fails.
- Diagnostics, completion, hover, and go-to-definition come from that server. The client does not analyze the buffer itself.
- Open a `.snl` source or a `.sns` script. `mod.sns`, `snova.sns`, `snova.mod`, `snova.toml`, and `Snovalang.toml` use the manifest grammar.
- **Snovalang: Run Current File** runs `snl run`.
- **Snovalang: Check Current File** runs `snl check` on the active file.
- **Snovalang: Check Project** runs `snl check --project`.
- **Snovalang: Tidy Dependencies** runs `snl tidy`.
- **Snovalang: Get Dependencies** runs `snl get`.

Run and check actions call the `snl` compiler (`snova.compilerPath`, or `~/.snova/bin/snl` when that file exists).
