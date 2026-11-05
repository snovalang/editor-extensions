# Install the Snovalang VS Code extension from the latest GitHub release.
#   irm https://raw.githubusercontent.com/snovalang/editor-extensions/master/install-vscode.ps1 | iex
$ErrorActionPreference = "Stop"

$repo = "snovalang/editor-extensions"
$url = if ($env:SNOVA_VSCODE_VSIX_URL) { $env:SNOVA_VSCODE_VSIX_URL } else { "https://github.com/$repo/releases/latest/download/snovalang.vsix" }
$dest = Join-Path $env:TEMP "snovalang.vsix"

Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing

function Install-ServerFromVsix([string]$Archive) {
    $stage = Join-Path $env:TEMP ("snova-lsp-vsix-" + [guid]::NewGuid().ToString("n"))
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    try {
        tar -xf $Archive -C $stage "extension/server/snova-lsp.exe"
        if ($LASTEXITCODE -ne 0) { throw "tar could not read extension/server/snova-lsp.exe" }
        $exe = Join-Path $stage "extension\server\snova-lsp.exe"
        if (-not (Test-Path -LiteralPath $exe)) { throw "snova-lsp.exe is not in the VSIX" }
        $binDir = Join-Path $env:USERPROFILE ".local\bin"
        New-Item -ItemType Directory -Force -Path $binDir | Out-Null
        Copy-Item -LiteralPath $exe -Destination (Join-Path $binDir "snova-lsp.exe") -Force
        Write-Host "Installed snova-lsp to $binDir\snova-lsp.exe"
    } finally {
        if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    }
}

try {
    Install-ServerFromVsix $dest
} catch {
    Write-Host "Could not copy snova-lsp to ~/.local/bin. The extension still starts the server bundled in the VSIX when that binary matches this system."
}

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
Write-Host "Diagnostics, completion, and navigation come from snova-lsp."
