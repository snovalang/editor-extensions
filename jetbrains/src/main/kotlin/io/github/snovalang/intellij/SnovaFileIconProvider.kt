package io.github.snovalang.intellij

import com.intellij.ide.FileIconProvider
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.VirtualFile
import javax.swing.Icon

/** TextMate files have a generic icon, so Snovalang files get theirs here. */
class SnovaFileIconProvider : FileIconProvider {
    override fun getIcon(file: VirtualFile, flags: Int, project: Project?): Icon? =
        if (SnovaFiles.isSource(file) || SnovaFiles.isManifest(file)) FILE_ICON else null

    private companion object {
        val FILE_ICON: Icon = IconLoader.getIcon("/icons/snovalang.svg", SnovaFileIconProvider::class.java)
    }
}
