# Snovalang for JetBrains IDEs

Plugin for JetBrains IDEs 2025.2 and newer. It needs the IDE's built-in LSP API, so open-source IntelliJ IDEA builds and Android Studio cannot load it.

- `textmate/snovalang/` in the plugin directory holds the VS Code extension's `package.json`, grammars, language configuration and snippets. The build copies them from `../vscode`, and the bundled TextMate plugin loads them.
- `server/` holds the snova-lsp binaries from `../vscode/server`.
- `SnovaLspServerSupportProvider` starts one snova-lsp per project when a `.snl`, `.sns` or manifest file opens.
- Autoimports from the LSP use the compiler's declared builtin packages, such as `builtin.io.console.output` for `Console`.
- **Tools | Snovalang** provides file and project run, build and check actions, plus dependency get and tidy.

```sh
./gradlew runIde        # sandbox IDE with the plugin
./gradlew buildPlugin   # build/distributions/*.zip
./gradlew verifyPlugin  # IntelliJ Plugin Verifier against recommended IDE releases
```

`pluginVersion` in `gradle.properties` is set by the release workflow.
