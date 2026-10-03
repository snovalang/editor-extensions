# Snovalang Editor Extensions

Syntax highlighting, snippets, and language-server support for Snovalang in VS Code and Zed.

Run and check actions call the installed compiler command, `snl`. Diagnostics, hover, and completion use the `snova-lsp` binary bundled in the VS Code extension. A `snova-lsp` on `PATH` is the fallback.

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
- Manifest highlighting for `mod.sns` and `snova.sns`
- Bundled `snova-lsp` (the server that discards diagnostics without `tmpfile()`)
- Snippets (`func`, `method`, `class`, `struct`, `enum`, `match`, `for`, `pulsar`)
- Language configuration (brackets and auto-closing pairs)
- Language client for `snova-lsp` over stdio
- **Snovalang: Run Current File** runs `snl run`
- **Snovalang: Check Project** runs `snl check --project .`

### Zed ([`zed/`](zed/))

- Tree-sitter highlighting, brackets, indents, and outline
- Language server integration for `snova-lsp`

## Developing

Clone this repository to change the extensions.

```sh
./scripts/package-vscode.sh   # writes dist/snovalang.vsix
./scripts/package-zed.sh      # writes dist/snovalang-zed.tar.gz
```

Pushing a tag `vX.Y.Z` runs the release workflow, which attaches those two files to the GitHub release.

VS Code development: `cd vscode && npm ci && npm run compile`.

Zed development: in Zed, run **zed: install dev extension** and select the `zed/` directory. Grammar revisions are the `rev` fields in `zed/extension.toml`. On Windows, if the host linker reports `msvcrt.lib` missing, build with the GNU toolchain (`zed/build.ps1`).

`install_ide.sh` and `install_ide.ps1` are an optional checklist. They call the same release installers.
