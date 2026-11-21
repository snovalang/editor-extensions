import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinVersion

plugins {
    id("org.jetbrains.kotlin.jvm") version "2.2.21"
    id("org.jetbrains.intellij.platform") version "2.20.1"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

val repoRoot = layout.projectDirectory.dir("..")
val vscodeDir = repoRoot.dir("vscode")

kotlin {
    jvmToolchain(21)
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_21)
        // 2025.2 bundles a Kotlin 2.1+ standard library.
        apiVersion.set(KotlinVersion.KOTLIN_2_1)
        languageVersion.set(KotlinVersion.KOTLIN_2_1)
    }
}

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        // The multi-platform Maven artifact, so macOS builds need no DMG extraction.
        intellijIdea(providers.gradleProperty("platformVersion")) { useInstaller = false }
        bundledPlugin("org.jetbrains.plugins.textmate")
        testFramework(TestFrameworkType.Platform)
    }
    testImplementation("junit:junit:4.13.2")
}

intellijPlatform {
    // Indexing settings text launches a headless IDE; the plugin has one small page.
    buildSearchableOptions = false
    pluginConfiguration {
        id = "io.github.snovalang"
        name = "Snovalang"
        version = providers.gradleProperty("pluginVersion")
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = provider { null }
        }
    }
    pluginVerification {
        ides { recommended() }
    }
    publishing {
        token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
    }
}

// The TextMate grammars, language configuration and snippets are the VS Code
// extension's own files, so both editors highlight Snovalang identically.
// They are copied next to the plugin jar, not into it, because the TextMate
// plugin loads a bundle from a directory on disk.
val textMateBundle = copySpec {
    from(vscodeDir) {
        include("package.json", "language-configuration.json", "syntaxes/**", "snippets/**")
    }
}

// The same snova-lsp binaries the VSIX ships: Linux ELF, Windows PE and a
// universal Mach-O for macOS, plus the compiler builtins snova-lsp finds in
// the `builtin` directory beside its executable.
val serverBinaries = copySpec {
    from(vscodeDir.dir("server")) {
        include("snova-lsp", "snova-lsp.exe", "snova-lsp-darwin")
        filePermissions { unix("rwxr-xr-x") }
    }
    from(vscodeDir.dir("server")) {
        include("builtin/**")
    }
}

tasks {
    // The zip task does not inherit the sandbox's file modes, so mark the
    // server executables here. SnovaServerLocator also restores the bit.
    buildPlugin {
        filesMatching(listOf("**/server/snova-lsp", "**/server/snova-lsp-darwin")) {
            permissions { unix("rwxr-xr-x") }
        }
    }
    prepareSandbox {
        into(intellijPlatform.projectName) {
            into("textmate/snovalang") { with(textMateBundle) }
            into("server") { with(serverBinaries) }
        }
    }
}
