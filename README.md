# Snovalang Editor Extensions

Official editor extensions for **VS Code** and **Zed** providing complete editing and LSP support for Snovalang.

## Extensions

### 1. VS Code ([`vscode/`](vscode/))
- TextMate grammar highlighting (`.snl`, `.sns`, manifests `mod.sns` and `snova.sns`)
- Code snippets (`func`, `method`, `class`, `data class`, `extension`, `struct`, `enum`, `match`, `for`, `pulsar`)
- Language configuration (bracket matching, auto-closing pairs)
- LSP client connecting to `snova-lsp` via stdio, with automatic install into `~/.snova/bin` when the binary is missing (`snova.lsp.autoInstall`, default on)

### 2. Zed Editor ([`zed/`](zed/))
- Tree-sitter query mappings (`highlights.scm`, `brackets.scm`, `outline.scm`)
- Language server integration for `snova-lsp`
