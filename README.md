# Snovalang Editor Extensions

Syntax highlighting, snippets, and language-server support for Snovalang in VS Code, JetBrains IDEs, and Zed.

Diagnostics, hover, completion, signature help, and navigation come from [snova-lsp](https://github.com/snovalang/snova-lsp). Each editor starts one server process per workspace, in the background, when a Snovalang file is opened. Run and check actions still call the installed compiler command, `snl`.

The VS Code extension ships Linux ELF `snova-lsp`, Windows `snova-lsp.exe`, and universal Mach-O `snova-lsp-darwin`. If no shipped binary matches, VS Code can clone `https://github.com/snovalang/snova-lsp` and run `make install`. The JetBrains plugin ships the same three binaries. Zed requires a separately installed `snova-lsp` on the worktree's `PATH`, as described below. On macOS VS Code starts the universal Mach-O binary and does not launch the Linux or Windows executable.

## Downloads

[![Latest release](https://img.shields.io/github/v/release/snovalang/editor-extensions?label=latest&sort=semver)](https://github.com/snovalang/editor-extensions/releases/latest) [![Release date](https://img.shields.io/github/release-date/snovalang/editor-extensions?label=released)](https://github.com/snovalang/editor-extensions/releases/latest)

The badge shows the newest version, and these links always download that version:

| Editor | Download |
| --- | --- |
| VS Code | [snovalang.vsix](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang.vsix) |
| JetBrains IDEs | [snovalang-jetbrains.zip](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang-jetbrains.zip) |
| Zed | [snovalang-zed.tar.gz](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang-zed.tar.gz) |

Earlier versions and release notes: [all releases](https://github.com/snovalang/editor-extensions/releases). The JetBrains plugin is attached to releases after v0.3.0.

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

## JetBrains IDEs

IntelliJ IDEA, PyCharm, WebStorm, GoLand, CLion, Rider, RustRover, PhpStorm, RubyMine, DataGrip and DataSpell, version 2025.2 or newer. The plugin uses the IDE's built-in LSP client, which open-source IntelliJ IDEA builds and Android Studio do not include. The plugin declares no upper version bound, so new IDE releases load it without a plugin update; every pull request runs the IntelliJ Plugin Verifier against the current releases from 2025.2 through the newest.

Linux and macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-jetbrains.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-jetbrains.ps1 | iex
```

Both scripts download [snovalang-jetbrains.zip](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang-jetbrains.zip) and copy the plugin into every JetBrains IDE 2025.2 or newer that has a configuration directory for the current user. Restart the IDE afterwards.

From the IDE, download the zip and open **Settings | Plugins | ⚙ | Install Plugin from Disk...**.

The release workflow publishes the plugin to the JetBrains Marketplace when the `JETBRAINS_MARKETPLACE_TOKEN` repository secret is set.

## Zed

Linux and macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-zed.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-zed.ps1 | iex
```

Both scripts download [snovalang-zed.tar.gz](https://github.com/snovalang/editor-extensions/releases/latest/download/snovalang-zed.tar.gz) and extract it into Zed's installed-extensions directory (`~/.local/share/zed/extensions/installed/snovalang` on Linux, `~/Library/Application Support/Zed/extensions/installed/snovalang` on macOS, `%LOCALAPPDATA%\Zed\extensions\installed\snovalang` on Windows). The archive contains the Zed extension component (`extension.wasm`), compiled Tree-sitter grammars and language queries. Zed does not publish a standalone `.wasi` file format: its extension uses a `wasm32-wasip2` component inside this archive. Install `snova-lsp` separately and make it available on `PATH`; the extension resolves it through Zed's `Worktree::which` API and does not bundle or install the server. Restart Zed, or run **zed: reload extensions**.

After the extension is accepted into the [Zed extension repository](https://github.com/zed-industries/extensions), it also appears in the Extensions gallery. The release archive is the install path that works before that listing exists.

## Extensions

### VS Code ([`vscode/`](vscode/))

- TextMate highlighting for `.snl` sources and `.sns` scripts
- Snovalang file icons in the VS Code explorer
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

### JetBrains ([`jetbrains/`](jetbrains/))

- Highlighting, brackets, comment toggling and snippets from the VS Code TextMate grammars, language configuration and snippets
- Snovalang file icons
- Bundled `snova-lsp` (the same Linux, Windows and universal Mach-O binaries as the VSIX), then `~/.local/bin/snova-lsp`, then `PATH`. **Settings | Languages & Frameworks | Snovalang** sets a custom server path, the `snl` path and server logging
- One `snova-lsp` per project, through the IDE's LSP client
- **Tools | Snovalang** runs `snl run`, `snl check`, `snl check --project`, `snl tidy` and `snl get` in the Run tool window, and restarts the language server

### Zed ([`zed/`](zed/))

- Tree-sitter highlighting, brackets, indents, and outline
- One `snova-lsp` process per worktree, resolved from the worktree's `PATH`
- `.snl` / `.sns` sources and manifest suffixes with indentation, comment toggling, brackets, highlighting and code outline

## Developing

Clone this repository to change the extensions.

```sh
./scripts/package-vscode.sh   # writes dist/snovalang.vsix
./scripts/package-zed.sh      # writes dist/snovalang-zed.tar.gz (wasm32-wasip2 component + Tree-sitter grammars)
./scripts/package-jetbrains.sh # writes dist/snovalang-jetbrains.zip (needs JDK 21)
```

Every push to `master` creates a GitHub release with `snovalang.vsix`, `snovalang-zed.tar.gz` and `snovalang-jetbrains.zip`. The [Downloads](#downloads) badge and links follow the newest release. Release versions follow Conventional Commits: `feat:` bumps minor, a breaking change (`!` or `BREAKING CHANGE:`) bumps major, and other commits bump patch. GitHub Copilot is instructed to use these commit prefixes in [.github/copilot-instructions.md](.github/copilot-instructions.md). The release workflow takes the version from the newest `v*` tag, sets it in the VS Code, Zed and JetBrains manifests inside the CI workspace before building, and tags the merged commit. It does not push to `master`.

VS Code development: `cd vscode && npm ci && npm run compile`.

JetBrains development: `cd jetbrains && ./gradlew runIde` starts an IDE sandbox with the plugin; `./gradlew verifyPlugin` checks it against current IDE releases.

Zed development: in Zed, run **zed: install dev extension** and select the `zed/` directory. Grammar revisions are the `rev` fields in `zed/extension.toml`. On Windows, if the host linker reports `msvcrt.lib` missing, build with the GNU toolchain (`zed/build.ps1`).

`install_ide.sh` and `install_ide.ps1` are an optional checklist. They call the same release installers.

## License

This project is licensed under the [Apache License, Version 2.0](LICENSE).
Copyright 2026 Snovalang contributors. See [NOTICE](NOTICE).
