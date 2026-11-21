package io.github.snovalang.intellij.lsp

import com.intellij.execution.ExecutionException
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.LspServerManager
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor
import io.github.snovalang.intellij.SnovaFiles
import io.github.snovalang.intellij.settings.SnovaSettings
import java.nio.charset.StandardCharsets
import java.nio.file.Path

/**
 * Starts one snova-lsp per project when a Snovalang file opens.
 *
 * The server reads stdin and writes stdout; its only documented flag is
 * `--log <file>`. It indexes .snl and .sns files itself.
 */
class SnovaLspServerSupportProvider : LspServerSupportProvider {
    override fun fileOpened(
        project: Project,
        file: VirtualFile,
        serverStarter: LspServerSupportProvider.LspServerStarter,
    ) {
        if (SnovaFiles.isSnovalang(file)) {
            serverStarter.ensureServerStarted(SnovaLspServerDescriptor(project))
        }
    }
}

class SnovaLspServerDescriptor(project: Project) : ProjectWideLspServerDescriptor(project, "Snovalang") {
    override fun isSupportedFile(file: VirtualFile): Boolean = SnovaFiles.isSnovalang(file)

    /** The language ids the VS Code client sends, so the server sees the same documents. */
    override fun getLanguageId(file: VirtualFile): String =
        if (SnovaFiles.isManifest(file)) "snova-manifest" else "snova"

    override fun createCommandLine(): GeneralCommandLine {
        val server = SnovaServerLocator.find()
            ?: throw ExecutionException(
                "snova-lsp was not found. Install it from https://github.com/snovalang/snova-lsp " +
                    "(make install) or set its path in Settings | Languages & Frameworks | Snovalang."
            )
        val commandLine = GeneralCommandLine(server.toString())
            .withCharset(StandardCharsets.UTF_8)
        project.basePath?.let { commandLine.withWorkingDirectory(Path.of(it)) }
        if (SnovaSettings.getInstance().traceServer) {
            val log = Path.of(System.getProperty("java.io.tmpdir"), "snova-lsp.log")
            commandLine.addParameters("--log", log.toString())
        }
        return commandLine
    }
}

object SnovaLsp {
    fun restart(project: Project) {
        LspServerManager.getInstance(project)
            .stopAndRestartIfNeeded(SnovaLspServerSupportProvider::class.java)
    }
}
