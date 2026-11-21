package io.github.snovalang.intellij.lsp

import com.intellij.openapi.diagnostic.logger
import com.intellij.ide.BrowserUtil
import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.util.net.HttpConnectionUtils
import com.google.gson.JsonParser
import io.github.snovalang.intellij.settings.SnovaSettings
import java.io.BufferedInputStream
import java.net.HttpURLConnection
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Updates the bundled LSP from the current JetBrains editor package release.
 * The snova-lsp repository publishes source/tags but no binary GitHub releases;
 * editor-extensions releases contain the signed-off, cross-platform binaries.
 */
class SnovaLspUpdater : ProjectActivity {
    override suspend fun execute(project: Project) {
        if (!started.compareAndSet(false, true)) return

        try {
            val latestTag = withContext(Dispatchers.IO) { latestPluginReleaseTag() }
            latestTag?.let { notifyPluginUpdate(project, it) }

            if (SnovaSettings.getInstance().serverPath.isNotEmpty()) return
            val updated = withContext(Dispatchers.IO) { updateBundledServer() }
            if (updated) {
                ApplicationManager.getApplication().invokeLater {
                    ProjectManager.getInstance().openProjects
                        .filterNot(Project::isDisposed)
                        .forEach(SnovaLsp::restart)
                }
            }
        } catch (error: Exception) {
            LOG.warn("Could not check for a Snovalang LSP update", error)
        }
    }

    private fun latestPluginReleaseTag(): String? = runCatching {
        val release = getJson(RELEASE_API)
        val tag = release.get("tag_name")?.takeIf { it.isJsonPrimitive }?.asString ?: return null
        val current = currentPluginVersion() ?: return null
        if (isNewerVersion(tag, current)) tag else null
    }.onFailure { LOG.warn("Could not check for a Snovalang plugin update", it) }.getOrNull()

    private fun currentPluginVersion(): String? = runCatching {
        SnovaLspUpdater::class.java.getResourceAsStream("/META-INF/plugin.xml")
            ?.bufferedReader(Charsets.UTF_8)?.use { reader ->
                Regex("<version>\\s*([^<]+?)\\s*</version>").find(reader.readText())?.groupValues?.get(1)
            }
    }.getOrNull()

    private fun notifyPluginUpdate(project: Project, tag: String) {
        val state = PropertiesComponent.getInstance()
        if (state.getValue(UPDATE_NOTICE_KEY) == tag) return
        state.setValue(UPDATE_NOTICE_KEY, tag)
        NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATION_GROUP)
            .createNotification(
                "Snovalang $tag is available. Update the plugin from Settings | Plugins | Updates.",
                NotificationType.INFORMATION,
            )
            .addAction(NotificationAction.createSimple("View release") {
                BrowserUtil.browse("https://github.com/snovalang/editor-extensions/releases/tag/$tag")
            })
            .notify(project)
    }

    private fun isNewerVersion(latest: String, current: String): Boolean {
        fun parts(version: String): List<Int>? {
            val normalized = version.trim().removePrefix("v").substringBefore('-').substringBefore('+')
            val numbers = normalized.split('.')
            if (numbers.size != 3 || numbers.any { it.toIntOrNull() == null }) return null
            return numbers.map(String::toInt)
        }
        val newParts = parts(latest) ?: return false
        val currentParts = parts(current) ?: return false
        return newParts.zip(currentParts).firstNotNullOfOrNull { (new, old) ->
            (new > old).takeIf { new != old }
        } ?: false
    }

    private fun updateBundledServer(): Boolean {
        val root = PathManager.getConfigDir().resolve("snovalang").resolve("lsp-updates")
        Files.createDirectories(root)
        val latestFile = root.resolve("latest.json")
        val now = System.currentTimeMillis()
        if (Files.isRegularFile(latestFile)) {
            runCatching {
                val previous = JsonParser.parseString(Files.readString(latestFile)).asJsonObject
                val checkedAt = previous.get("checkedAt").asLong
                if (now - checkedAt < CHECK_INTERVAL_MS) return false
            }
        }

        val release = getJson(RELEASE_API)
        val tag = release.get("tag_name")?.takeIf { it.isJsonPrimitive }?.asString ?: return false
        val assets = release.getAsJsonArray("assets") ?: return false
        val asset = assets.map { it.asJsonObject }.firstOrNull {
            it.get("name")?.asString == ASSET_NAME
        } ?: return false
        val digest = asset.get("digest")?.takeIf { it.isJsonPrimitive }?.asString ?: return false
        val expectedHash = digest.removePrefix("sha256:").lowercase()
        if (!expectedHash.matches(Regex("[0-9a-f]{64}"))) return false

        val installed = latestFile.takeIf { Files.isRegularFile(it) }?.let {
            runCatching { JsonParser.parseString(Files.readString(it)).asJsonObject }.getOrNull()
        }
        if (installed?.get("tag")?.asString == tag) {
            writeCheckTime(latestFile, tag, now)
            return false
        }

        val url = asset.get("browser_download_url")?.asString ?: return false
        val bytes = download(url, MAX_ARCHIVE_BYTES)
        if (!sha256(bytes).equals(expectedHash, ignoreCase = true)) {
            throw IllegalStateException("GitHub release archive SHA-256 did not match its published digest")
        }

        val target = root.resolve(tag.removePrefix("v").replace(Regex("[^A-Za-z0-9._-]"), "_"))
        val stage = Files.createTempDirectory(root, "stage-")
        try {
            extractServer(bytes, stage)
            val serverName = hostServerName()
            val stagedServer = stage.resolve("server").resolve(serverName)
            if (!Files.isRegularFile(stagedServer) || !SnovaServerLocator.matchesHost(stagedServer)) {
                throw IllegalStateException("Release did not contain a usable $serverName for this host")
            }
            val stagedBuiltin = stage.resolve("server/builtin")
            if (!Files.isDirectory(stagedBuiltin)) {
                throw IllegalStateException("Release did not contain the Snovalang compiler builtins")
            }
            if (!Files.exists(target)) {
                try {
                    Files.move(stage.resolve("server"), target, StandardCopyOption.ATOMIC_MOVE)
                } catch (_: java.nio.file.AtomicMoveNotSupportedException) {
                    Files.move(stage.resolve("server"), target)
                }
            }
            writeCheckTime(latestFile, tag, now)
            return true
        } finally {
            deleteTree(stage)
        }
    }

    private fun extractServer(bytes: ByteArray, stage: Path) {
        ZipInputStream(BufferedInputStream(bytes.inputStream())).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val marker = "/server/"
                val markerIndex = entry.name.indexOf(marker)
                if (markerIndex < 0 || entry.isDirectory) continue
                val relative = entry.name.substring(markerIndex + 1)
                if (!(relative == "server/${hostServerName()}" || relative.startsWith("server/builtin/"))) continue
                val destination = stage.resolve(relative).normalize()
                if (!destination.startsWith(stage)) throw IllegalStateException("Invalid path in release archive")
                Files.createDirectories(destination.parent)
                Files.copy(zip, destination)
            }
        }
    }

    private fun getJson(url: String) = JsonParser.parseString(download(url, MAX_JSON_BYTES).toString(Charsets.UTF_8)).asJsonObject

    private fun download(url: String, maxBytes: Int): ByteArray {
        val connection = HttpConnectionUtils.openHttpConnection(url)
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.setRequestProperty("User-Agent", USER_AGENT)
        connection.setRequestProperty("Accept", "application/vnd.github+json")
        try {
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                throw IllegalStateException("GitHub returned HTTP ${connection.responseCode} for $url")
            }
            val declaredLength = connection.contentLengthLong
            if (declaredLength > maxBytes) throw IllegalStateException("GitHub response is too large")
            connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(16 * 1024)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (output.size() + count > maxBytes) throw IllegalStateException("GitHub response is too large")
                    output.write(buffer, 0, count)
                }
                return output.toByteArray()
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun writeCheckTime(file: Path, tag: String, checkedAt: Long) {
        val temporary = Files.createTempFile(file.parent, "latest-", ".json")
        try {
            Files.writeString(temporary, "{\"tag\":\"$tag\",\"checkedAt\":$checkedAt}")
            try {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
            } catch (_: java.nio.file.AtomicMoveNotSupportedException) {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING)
            }
        } finally {
            Files.deleteIfExists(temporary)
        }
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun hostServerName(): String = when {
        System.getProperty("os.name").startsWith("Windows", true) -> "snova-lsp.exe"
        System.getProperty("os.name").startsWith("Mac", true) -> "snova-lsp-darwin"
        else -> "snova-lsp"
    }

    private fun deleteTree(path: Path) {
        if (!Files.exists(path)) return
        Files.walk(path).use { files ->
            files.sorted(Comparator.reverseOrder<Path>()).forEach { Files.deleteIfExists(it) }
        }
    }

    companion object {
        private val LOG = logger<SnovaLspUpdater>()
        private val started = AtomicBoolean(false)
        private const val PLUGIN_ID = "io.github.snovalang"
        private const val NOTIFICATION_GROUP = "Snovalang"
        private const val UPDATE_NOTICE_KEY = "snovalang.pluginUpdateNotice"
        private const val RELEASE_API = "https://api.github.com/repos/snovalang/editor-extensions/releases/latest"
        private const val ASSET_NAME = "snovalang-jetbrains.zip"
        private const val USER_AGENT = "Snovalang-JetBrains-Plugin"
        private const val CHECK_INTERVAL_MS = 24L * 60 * 60 * 1000
        private const val CONNECT_TIMEOUT_MS = 5000
        private const val READ_TIMEOUT_MS = 20000
        private const val MAX_JSON_BYTES = 1024 * 1024
        private const val MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
    }
}
