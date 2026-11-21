package io.github.snovalang.intellij

import com.intellij.openapi.vfs.VirtualFile
import java.nio.file.Files
import java.nio.file.Path

/** File names and plugin paths shared by the LSP client, the actions and TextMate. */
object SnovaFiles {
    /** Source and script suffixes; the VS Code and Zed extensions accept the same two. */
    val SOURCE_EXTENSIONS = setOf("snl", "sns")

    /** Basenames snova-lsp treats as manifests, including legacy names. */
    val MANIFEST_FILENAMES = listOf("mod.sns", "snova.sns", "snova.mod", "snova.toml", "Snovalang.toml")

    fun isManifest(file: VirtualFile): Boolean = file.name in MANIFEST_FILENAMES

    fun isSource(file: VirtualFile): Boolean = file.extension in SOURCE_EXTENSIONS

    fun isSnovalang(file: VirtualFile): Boolean =
        file.isInLocalFileSystem && !file.isDirectory && (isSource(file) || isManifest(file))

    /** Locate the unpacked plugin root from this class's own code source. */
    fun pluginDir(): Path? = runCatching {
        val location = Path.of(SnovaFiles::class.java.protectionDomain.codeSource.location.toURI())
        val start = if (Files.isRegularFile(location)) location.parent else location
        generateSequence(start) { it.parent }.firstOrNull {
            Files.isDirectory(it.resolve("server")) && Files.isDirectory(it.resolve("lib"))
        }
    }.getOrNull()

    /** Nearest ancestor directory of [file] that holds a manifest, like the VS Code client. */
    fun findProject(file: Path): Path? {
        var dir: Path? = file.parent
        while (dir != null) {
            val current = dir
            if (MANIFEST_FILENAMES.any { Files.isRegularFile(current.resolve(it)) }) return current
            dir = current.parent
        }
        return null
    }
}
