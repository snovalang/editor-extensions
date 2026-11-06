# Install the prebuilt Snovalang Zed extension from the latest GitHub release.
#   irm https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-zed.ps1 | iex
$ErrorActionPreference = "Stop"

$repo = "snovalang/editor-extensions"
$url = if ($env:SNOVA_ZED_URL) { $env:SNOVA_ZED_URL } else { "https://github.com/$repo/releases/latest/download/snovalang-zed.tar.gz" }
$extRoot = Join-Path $env:LOCALAPPDATA "Zed\extensions"
$installed = Join-Path $extRoot "installed\snovalang"
$tmp = Join-Path $env:TEMP ("snovalang-zed-" + [guid]::NewGuid().ToString("n"))

New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
    $archive = Join-Path $tmp "snovalang-zed.tar.gz"
    Write-Host "Downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
    tar -xzf $archive -C $tmp
    $unpacked = Join-Path $tmp "snovalang"
    $required = @(
        "extension.toml",
        "extension.wasm",
        "icon_themes\snovalang-icons.json",
        "icons\snovalang-dark.png",
        "icons\snovalang-light.png",
        "grammars\snovalang.wasm",
        "grammars\snovalang_manifest.wasm",
        "languages\snovalang\config.toml",
        "languages\snovalang_manifest\config.toml",
        "server\snova-lsp.exe"
    )
    foreach ($relativePath in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $unpacked $relativePath) -PathType Leaf)) {
            throw "Archive is incomplete; missing snovalang/$relativePath"
        }
    }
    if ((Get-Item -LiteralPath (Join-Path $unpacked "extension.wasm")).Length -eq 0) {
        throw "Archive contains an empty extension.wasm"
    }
    foreach ($relativePath in @("icon_themes\snovalang-icons.json", "icons\snovalang-dark.png", "icons\snovalang-light.png")) {
        if ((Get-Item -LiteralPath (Join-Path $unpacked $relativePath)).Length -eq 0) {
            throw "Archive contains an empty icon asset: snovalang/$relativePath"
        }
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
    $bundled = Join-Path $installed "server\snova-lsp.exe"
    $binDir = Join-Path $env:USERPROFILE ".local\bin"
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    Copy-Item -LiteralPath $bundled -Destination (Join-Path $binDir "snova-lsp.exe") -Force
    Write-Host "Installed snova-lsp to $binDir\snova-lsp.exe"
    Write-Host "Installed Snovalang to $installed"
    Write-Host "Restart Zed, or run 'zed: reload extensions' from the command palette."
} finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
}
