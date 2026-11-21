package io.github.snovalang.intellij.actions

import com.intellij.execution.ExecutionException
import com.intellij.execution.RunContentExecutor
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ColoredProcessHandler
import com.intellij.execution.process.ProcessTerminatedListener
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import io.github.snovalang.intellij.SnovaFiles
import io.github.snovalang.intellij.lsp.SnovaLsp
import io.github.snovalang.intellij.settings.SnovaSettings
import java.nio.charset.StandardCharsets
import java.nio.file.Path

/** What an `snl` invocation needs: the current file, if any, and its project root. */
data class Target(val file: Path?, val project: Path?)

private fun targetOf(e: AnActionEvent): Target {
    val vf = e.getData(CommonDataKeys.VIRTUAL_FILE)?.takeIf(SnovaFiles::isSnovalang)
    val file = vf?.toNioPath()
    val project = file?.let(SnovaFiles::findProject)
        ?: if (file == null) e.project?.basePath?.let(Path::of) else null
    return Target(file, project)
}

/**
 * Runs `snl <args>` in the Run tool window. No shell is involved, so paths
 * need no quoting. Arguments mirror the VS Code commands.
 */
abstract class SnlAction : DumbAwareAction() {
    protected abstract val requiresFile: Boolean

    /** Title and argv for [target], or an error message when it cannot run. */
    protected abstract fun command(target: Target): Result<Pair<String, List<String>>>

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val vf = e.getData(CommonDataKeys.VIRTUAL_FILE)
        e.presentation.isEnabledAndVisible =
            e.project != null && (!requiresFile || (vf != null && SnovaFiles.isSnovalang(vf)))
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val target = targetOf(e)
        command(target).fold(
            onSuccess = { (title, args) ->
                val cwd = target.project ?: target.file?.parent ?: project.basePath?.let(Path::of)
                run(project, title, args, cwd)
            },
            onFailure = { notify(project, it.message ?: "Cannot run snl.") },
        )
    }

    private fun run(project: Project, title: String, args: List<String>, cwd: Path?) {
        FileDocumentManager.getInstance().saveAllDocuments()
        val commandLine = GeneralCommandLine(listOf(SnovaSettings.getInstance().compilerPath) + args)
            .withCharset(StandardCharsets.UTF_8)
            .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
        cwd?.let { commandLine.withWorkingDirectory(it) }
        try {
            val handler = ColoredProcessHandler(commandLine)
            ProcessTerminatedListener.attach(handler)
            RunContentExecutor(project, handler)
                .withTitle("snl $title")
                .withActivateToolWindow(true)
                .run()
        } catch (ex: ExecutionException) {
            notify(project, "Could not start ${commandLine.exePath}: ${ex.message}. " +
                "Set the snl path in Settings | Languages & Frameworks | Snovalang.")
        }
    }

    protected fun fail(message: String) = Result.failure<Pair<String, List<String>>>(IllegalStateException(message))
}

private fun notify(project: Project, message: String) {
    NotificationGroupManager.getInstance()
        .getNotificationGroup("Snovalang")
        .createNotification(message, NotificationType.ERROR)
        .notify(project)
}

class RunFileAction : SnlAction() {
    override val requiresFile = true
    override fun command(target: Target) = target.file
        ?.let { Result.success("run ${it.fileName}" to listOf("run", it.toString())) }
        ?: fail("Open a Snovalang file to run.")
}

class CheckFileAction : SnlAction() {
    override val requiresFile = true
    override fun command(target: Target) = target.file
        ?.let { Result.success("check ${it.fileName}" to listOf("check", it.toString())) }
        ?: fail("Open a Snovalang file to check.")
}

class CheckProjectAction : SnlAction() {
    override val requiresFile = false
    override fun command(target: Target) = target.project
        ?.let { Result.success("check project" to listOf("check", "--project", it.toString())) }
        ?: fail("No mod.sns found for this file.")
}

class BuildFileAction : SnlAction() {
    override val requiresFile = true
    override fun command(target: Target) = target.file
        ?.let { Result.success("build ${it.fileName}" to listOf("build", it.toString())) }
        ?: fail("Open a Snovalang file to build.")
}

class BuildProjectAction : SnlAction() {
    override val requiresFile = false
    override fun command(target: Target) = target.project
        ?.let { Result.success("build project" to listOf("build", "--project", it.toString())) }
        ?: fail("No Snovalang project found.")
}

class RunProjectAction : SnlAction() {
    override val requiresFile = false
    override fun command(target: Target) = target.project
        ?.let { Result.success("run project" to listOf("run", "--project", it.toString())) }
        ?: fail("No Snovalang project found.")
}

class TidyAction : SnlAction() {
    override val requiresFile = false
    override fun command(target: Target) = target.project
        ?.let { Result.success("tidy" to listOf("tidy", "--project", it.toString())) }
        ?: fail("No mod.sns found for this file.")
}

class GetDependenciesAction : SnlAction() {
    override val requiresFile = false
    override fun command(target: Target) = target.project
        ?.let { Result.success("get" to listOf("get", "--project=$it")) }
        ?: fail("No mod.sns found for this file.")
}

class RestartServerAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT
    override fun update(e: AnActionEvent) { e.presentation.isEnabledAndVisible = e.project != null }
    override fun actionPerformed(e: AnActionEvent) { e.project?.let(SnovaLsp::restart) }
}
