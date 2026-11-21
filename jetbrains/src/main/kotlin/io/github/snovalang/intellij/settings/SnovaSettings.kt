package io.github.snovalang.intellij.settings

import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.SimplePersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

/** IDE-wide settings, matching the VS Code `snova.*` configuration keys. */
@Service(Service.Level.APP)
@State(name = "SnovalangSettings", storages = [Storage("snovalang.xml")])
class SnovaSettings : SimplePersistentStateComponent<SnovaSettings.State>(State()) {
    class State : BaseState() {
        /** Empty means: bundled server, then `make install` locations, then PATH. */
        var serverPath by string("")
        var compilerPath by string("snl")
        /** Starts the server with `--log <temp>/snova-lsp.log`. */
        var traceServer by property(false)
    }

    var serverPath: String
        get() = state.serverPath.orEmpty().trim()
        set(value) { state.serverPath = value.trim() }

    var compilerPath: String
        get() = state.compilerPath.orEmpty().trim().ifEmpty { "snl" }
        set(value) { state.compilerPath = value.trim() }

    var traceServer: Boolean
        get() = state.traceServer
        set(value) { state.traceServer = value }

    companion object {
        fun getInstance(): SnovaSettings = service()
    }
}
