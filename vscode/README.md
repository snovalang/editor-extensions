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

- On macOS the extension starts the universal Mach-O `server/snova-lsp-darwin` and does not launch the Linux ELF or the Windows executable. Linux starts `server/snova-lsp`. Windows starts `server/snova-lsp.exe`.
- A `snova.lsp.serverPath` value other than `snova-lsp` is used only when that file exists and its executable header matches the host.
- When no compatible binary is found and `snova.lsp.autoInstall` is on (the default), the extension builds `snova-lsp` into `~/.snova/bin`. **Snovalang: Install or Update Language Server** uses the bundled server when the VSIX includes one.
- Open a `.snl` source or a `.sns` script. `mod.sns` and `snova.sns` use the manifest grammar.
- **Snovalang: Run Current File** runs `snl run`.
- **Snovalang: Check Current File** runs `snl check` on the active file.
- **Snovalang: Check Project** runs `snl check --project`.
- **Snovalang: Tidy Dependencies** runs `snl tidy`.
- **Snovalang: Get Dependencies** runs `snl get`.

Run and check actions call the `snl` compiler (`snova.compilerPath`, or `~/.snova/bin/snl` when that file exists).
