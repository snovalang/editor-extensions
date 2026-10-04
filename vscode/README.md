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

- On macOS the extension starts the universal Mach-O `server/snova-lsp-darwin` and does not launch the Linux ELF or the Windows executable. Linux starts `server/snova-lsp`. Windows starts `server/snova-lsp.exe`. Set `snova.lsp.serverPath` to use a different binary.
- Open a `.snl` source or a `.sns` script.
- **Snovalang: Run Current File** runs `snl run`.
- **Snovalang: Check Project** runs `snl check --project .`.
