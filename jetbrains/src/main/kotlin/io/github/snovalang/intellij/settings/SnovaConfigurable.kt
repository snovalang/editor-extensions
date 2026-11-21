package io.github.snovalang.intellij.settings

import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import io.github.snovalang.intellij.lsp.SnovaLsp

class SnovaConfigurable : BoundConfigurable("Snovalang") {
    private val settings = SnovaSettings.getInstance()

    override fun createPanel(): DialogPanel = panel {
        group("Language Server") {
            row("snova-lsp path:") {
                textField()
                    .bindText(settings::serverPath)
                    .align(AlignX.FILL)
                    .comment(
                        "Leave empty to use the server shipped with the plugin, then ~/.local/bin/snova-lsp " +
                            "from <code>make install</code>, then PATH. A custom path is used only when the file " +
                            "exists and was built for this system."
                    )
            }
            row {
                checkBox("Write a server log (snova-lsp.log in the temp directory)")
                    .bindSelected(settings::traceServer)
            }
        }
        group("Toolchain") {
            row("snl path:") {
                textField()
                    .bindText(settings::compilerPath)
                    .align(AlignX.FILL)
                    .comment("Used by the Run, Check, Tidy and Get actions.")
            }
        }
    }

    override fun apply() {
        super.apply()
        // A new server path or log flag only takes effect in a new process.
        ProjectManager.getInstance().openProjects.forEach(SnovaLsp::restart)
    }
}
