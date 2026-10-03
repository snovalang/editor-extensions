# Install the Snovalang VS Code extension from the latest GitHub release.
#   irm https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-vscode.ps1 | iex
$ErrorActionPreference = "Stop"

$repo = "snovalang/editor-extensions"
$url = if ($env:SNOVA_VSCODE_VSIX_URL) { $env:SNOVA_VSCODE_VSIX_URL } else { "https://github.com/$repo/releases/latest/download/snovalang.vsix" }
$dest = Join-Path $env:TEMP "snovalang.vsix"

Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing

$cli = $env:VSCODE_CLI
if (-not $cli) {
    $code = Get-Command code -ErrorAction SilentlyContinue
    if ($code) { $cli = $code.Source }
}

if (-not $cli) {
    Write-Host "Saved $dest"
    Write-Host "The code command is not on PATH. In VS Code, run 'Extensions: Install from VSIX...' and select that file."
    exit 1
}

Write-Host "Running $cli --install-extension $dest"
& $cli --install-extension $dest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Snovalang is installed. Reload the window if the editor was already open."
