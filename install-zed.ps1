# Install the prebuilt Snovalang Zed extension from the latest GitHub release.
$ErrorActionPreference = "Stop"

$repo = "snovalang/editor-extensions"
$url = if ($env:SNOVA_ZED_URL) { $env:SNOVA_ZED_URL } else { "https://github.com/$repo/releases/latest/download/snovalang-zed.tar.gz" }
$extRoot = Join-Path $env:LOCALAPPDATA "Zed\extensions"
$installed = Join-Path $extRoot "installed\snovalang"
$tmp = Join-Path $env:TEMP ("snovalang-zed-" + [guid]::NewGuid().ToString("n"))

New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
    $archive = Join-Path $tmp "snovalang-zed.tar.gz"
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
    tar -xzf $archive -C $tmp
    $unpacked = Join-Path $tmp "snovalang"
    $required = @(
        "extension.toml",
        "extension.wasm",
        "grammars\snovalang.wasm",
        "grammars\snovalang_manifest.wasm",
        "languages\snovalang\config.toml",
        "languages\snovalang\highlights.scm",
        "languages\snovalang_manifest\config.toml",
        "languages\snovalang_manifest\highlights.scm"
    )
    foreach ($relativePath in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $unpacked $relativePath) -PathType Leaf)) {
            throw "Archive is incomplete; missing snovalang/$relativePath"
        }
    }
    # Older release archives bundled the language server; drop that obsolete
    # payload during migration. Current releases resolve snova-lsp on PATH.
    $bundledServer = Join-Path $unpacked "server"
    if (Test-Path -LiteralPath $bundledServer) {
        Remove-Item -LiteralPath $bundledServer -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path (Join-Path $extRoot "installed") | Out-Null
    $backup = "$installed.backup.$([guid]::NewGuid().ToString('n'))"
    if (Test-Path $installed) { Move-Item $installed $backup }
    try {
        Move-Item $unpacked $installed
    } catch {
        if (Test-Path $backup) { Move-Item $backup $installed }
        throw
    }
    if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }
    $index = Join-Path $extRoot "index.json"
    if (Test-Path $index) { Remove-Item -Force $index }
    Write-Host "Installed Snovalang to $installed"
    Write-Host "Install snova-lsp separately and make sure it is on PATH."
    Write-Host "Restart Zed, or run 'zed: reload extensions' from the command palette."
} finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
}
