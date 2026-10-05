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
    if (-not (Test-Path (Join-Path $unpacked "extension.toml")) -or -not (Test-Path (Join-Path $unpacked "extension.wasm"))) {
        throw "Archive is missing snovalang/extension.toml or snovalang/extension.wasm"
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $extRoot "installed") | Out-Null
    if (Test-Path $installed) { Remove-Item -Recurse -Force $installed }
    Move-Item $unpacked $installed
    $index = Join-Path $extRoot "index.json"
    if (Test-Path $index) { Remove-Item -Force $index }
    Write-Host "Installed Snovalang to $installed"
    Write-Host "Restart Zed, or run 'zed: reload extensions' from the command palette."
} finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
}
