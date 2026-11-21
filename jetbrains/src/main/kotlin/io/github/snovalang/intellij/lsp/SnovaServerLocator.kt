package io.github.snovalang.intellij.lsp

import com.intellij.execution.configurations.PathEnvironmentVariableUtil
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.util.SystemInfo
import io.github.snovalang.intellij.SnovaFiles
import io.github.snovalang.intellij.settings.SnovaSettings
import java.io.RandomAccessFile
import java.nio.file.Files
import java.nio.file.Path

/**
 * Finds a snova-lsp executable for this system, in the same order as the
 * VS Code extension: configured path, bundled binary, `make install`
 * locations, then PATH. Every file candidate must have an executable header
 * for this OS, so a macOS host never starts the Linux ELF or Windows PE.
 */
object SnovaServerLocator {
    private val LOG = logger<SnovaServerLocator>()

    private enum class Kind { MACHO, ELF, PE, UNKNOWN }

    private val installedName = if (SystemInfo.isWindows) "snova-lsp.exe" else "snova-lsp"
    private val aliasName = if (SystemInfo.isWindows) "snovalang-lsp.exe" else "snovalang-lsp"

    private val bundledName = when {
        SystemInfo.isMac -> "snova-lsp-darwin"
        SystemInfo.isWindows -> "snova-lsp.exe"
        else -> "snova-lsp"
    }

    fun find(): Path? {
        val configured = SnovaSettings.getInstance().serverPath
        if (configured.isNotEmpty()) {
            val path = Path.of(configured)
            if (matchesHost(path)) return prepare(path)
            LOG.warn("Ignoring snova-lsp path '$configured': missing or not built for this system")
        }
        return candidates().firstOrNull(::matchesHost)?.let(::prepare)
            ?: PathEnvironmentVariableUtil.findInPath(installedName)?.toPath()
            ?: PathEnvironmentVariableUtil.findInPath(aliasName)?.toPath()
    }

    private fun candidates(): List<Path> {
        val home = Path.of(System.getProperty("user.home"))
        val paths = mutableListOf<Path>()
        SnovaFiles.pluginDir()?.resolve("server")?.let { paths += it.resolve(bundledName) }
        paths += home.resolve(".local/bin").resolve(installedName)
        paths += home.resolve(".local/bin").resolve(aliasName)
        paths += home.resolve(".snova/bin").resolve(installedName)
        System.getenv("LOCALAPPDATA")?.takeIf { it.isNotEmpty() }?.let {
            paths += Path.of(it, "snova-lsp", "bin", installedName)
        }
        return paths
    }

    /** Plugin zips can lose the executable bit, so restore it before launch. */
    private fun prepare(path: Path): Path {
        if (!SystemInfo.isWindows && !Files.isExecutable(path)) {
            runCatching { path.toFile().setExecutable(true) }
                .onFailure { LOG.warn("Could not mark $path executable", it) }
        }
        return path
    }

    private fun matchesHost(path: Path): Boolean {
        if (!Files.isRegularFile(path)) return false
        val kind = runCatching { kindOf(path) }.getOrDefault(Kind.UNKNOWN)
        return when {
            SystemInfo.isMac -> kind == Kind.MACHO
            SystemInfo.isWindows -> kind == Kind.PE
            else -> kind == Kind.ELF
        }
    }

    private fun kindOf(path: Path): Kind {
        val header = ByteArray(4)
        RandomAccessFile(path.toFile(), "r").use { if (it.read(header) < 4) return Kind.UNKNOWN }
        val b = header.map { it.toInt() and 0xff }
        if (b[0] == 0x7f && b[1] == 0x45 && b[2] == 0x4c && b[3] == 0x46) return Kind.ELF
        if (b[0] == 0x4d && b[1] == 0x5a) return Kind.PE
        val magic = (b[0].toLong() shl 24) or (b[1].toLong() shl 16) or (b[2].toLong() shl 8) or b[3].toLong()
        return when (magic) {
            0xfeedfaceL, 0xcefaedfeL, 0xfeedfacfL, 0xcffaedfeL,
            0xcafebabeL, 0xbebafecaL, 0xcafebabfL, 0xbfbafecaL -> Kind.MACHO

            else -> Kind.UNKNOWN
        }
    }
}
