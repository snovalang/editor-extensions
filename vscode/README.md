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

- Put `snova-lsp` on `PATH`, or set `snova.lsp.serverPath`.
- Open a `.snl` source or a `.sns` script.
- **Snovalang: Run Current File** runs `snl run`.
- **Snovalang: Check Project** runs `snl check --project .`.
