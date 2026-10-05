# Snovalang — VS Code Extension

Extensão do Snovalang para Visual Studio Code, com realce de sintaxe e cliente do `snova-lsp`.

## Funcionalidades

- Realce TextMate para `.snl` e `.sns`, incluindo `data class`, `extension`, modificadores (`unsafe`, `sealed`, `final`, `open`, `internal`) e acessores `get`/`set`.
- Language Server: completion, diagnósticos, hover, go to definition e document symbols.
- Snippets para `data class`, `extension`, alias `type`, propriedade com acessores, `pulsar func` e `async func`.
- Instalação automática do language server quando o binário não está no PATH.

## Language server

Ao abrir um arquivo `.snl` ou `.sns`, a extensão procura `snova-lsp` nesta ordem:

1. `snova.lsp.serverPath`, quando o valor não é o padrão `snova-lsp` e o arquivo existe.
2. `~/.snova/bin`, o diretório local da extensão, `tools/bin` ou `build` de um checkout vizinho, e o PATH.
3. Se nada for encontrado e `snova.lsp.autoInstall` estiver ligado (padrão), a extensão compila o checkout local ou clona `snova-lsp` e `snovac` e instala o binário em `~/.snova/bin`.

O comando **Snovalang: Install or Update Language Server** força essa instalação. Um `snova.lsp.serverPath` explícito que não existe não é substituído.

Manifestos `mod.sns` e `snova.sns` usam a gramática de manifesto e não são enviados ao compilador como código.

## Instalação manual

Na raiz de `editor-extensions`:

```powershell
powershell -ExecutionPolicy Bypass -File install_ide.ps1
```

A opção "Default Snovalang LSP" executa `../snova-lsp/install.ps1`, que coloca `snova-lsp.exe` em `%USERPROFILE%\.snova\bin`.
