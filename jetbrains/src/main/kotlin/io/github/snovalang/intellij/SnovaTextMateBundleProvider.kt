package io.github.snovalang.intellij

import org.jetbrains.plugins.textmate.api.TextMateBundleProvider
import java.nio.file.Files

/**
 * Registers the VS Code extension's grammars, language configuration and
 * snippets with the bundled TextMate plugin. The build copies them into
 * `textmate/snovalang` inside the plugin directory.
 */
class SnovaTextMateBundleProvider : TextMateBundleProvider {
    override fun getBundles(): List<TextMateBundleProvider.PluginBundle> {
        val bundle = SnovaFiles.pluginDir()?.resolve("textmate")?.resolve("snovalang") ?: return emptyList()
        if (!Files.isRegularFile(bundle.resolve("package.json"))) return emptyList()
        return listOf(TextMateBundleProvider.PluginBundle("Snovalang", bundle))
    }
}
