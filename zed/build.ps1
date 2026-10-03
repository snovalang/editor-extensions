# build.ps1 — Windows developer build for the Snovalang Zed extension.
# End users install the prebuilt archive with install-zed.ps1.
#
# Usage:
#   .\build.ps1              # Release build (default)
#   .\build.ps1 -Debug       # Debug build
#   .\build.ps1 -Install     # Build and copy into the Zed extensions directory

param(
    [switch]$Debug,
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Verifica se rustup está instalado
if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: rustup not found. Install from https://rustup.rs" -ForegroundColor Red
    exit 1
}

# Garante que o target WASM está instalado
$wasmTarget = "wasm32-wasip2"
$installed = rustup target list --installed 2>&1
if ($installed -notmatch $wasmTarget) {
    Write-Host "Installing WASM target $wasmTarget..." -ForegroundColor Cyan
    rustup target add $wasmTarget
}

# Garante que o toolchain GNU está disponível (necessário no Windows sem Windows SDK completo)
$gnuToolchain = "stable-x86_64-pc-windows-gnu"
$toolchains = rustup toolchain list 2>&1
if ($toolchains -notmatch "x86_64-pc-windows-gnu") {
    Write-Host "Installing GNU toolchain (needed on Windows to avoid msvcrt.lib error)..." -ForegroundColor Cyan
    rustup toolchain install $gnuToolchain --target $wasmTarget
} else {
    # Garante que o target WASM está no toolchain GNU
    rustup target add $wasmTarget --toolchain $gnuToolchain 2>&1 | Out-Null
}

# Build
$profile = if ($Debug) { "debug" } else { "release" }
$releaseFlag = if ($Debug) { "" } else { "--release" }

Write-Host "Building Snovalang Zed extension ($profile)..." -ForegroundColor Cyan
$buildCmd = "cargo +$gnuToolchain build $releaseFlag"
Invoke-Expression $buildCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Zed's extension builder encodes the Rust WASM into a component itself.
# Do not copy a raw wasm module to extension.wasm.
$wasmSrc = "target\$wasmTarget\$profile\zed_snovalang.wasm"
if (-not (Test-Path $wasmSrc)) {
    Write-Host "ERROR: Rust WASM output not found at $wasmSrc" -ForegroundColor Red
    exit 1
}
if (Test-Path "extension.wasm") {
    Remove-Item -Force "extension.wasm"
}
Write-Host "Rust WASM compiled; Zed will encode the extension component." -ForegroundColor Green

if ($Install) {
    $zedRoot = if ($env:LOCALAPPDATA) { "$env:LOCALAPPDATA\Zed" } else { "$env:APPDATA\Zed" }
    $zedExtDir = "$zedRoot\extensions\installed\snovalang"
    $srcDir = $scriptDir

    if (Test-Path $zedExtDir) {
        Remove-Item -Recurse -Force $zedExtDir
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $zedExtDir) | Out-Null
    Copy-Item -Recurse -Force $srcDir $zedExtDir
    if (Test-Path (Join-Path $zedExtDir "extension.wasm")) {
        Remove-Item -Force (Join-Path $zedExtDir "extension.wasm")
    }
    $zedBinDir = "$zedRoot\tools\bin"
    New-Item -ItemType Directory -Force -Path $zedBinDir | Out-Null
    $lspSource = Join-Path $scriptDir "..\..\snova-lsp\tools\bin\snova-lsp.exe"
    if (-not (Test-Path $lspSource)) {
        $lspSource = Join-Path $scriptDir "..\..\snova-lsp\build\snova-lsp.exe"
    }
    if (Test-Path $lspSource) {
        $targetLsp = Join-Path $zedBinDir "snova-lsp.exe"
        if (Test-Path $targetLsp) {
            try {
                Copy-Item -Force $lspSource $targetLsp
            } catch {
                Move-Item -Path $targetLsp -Destination "$targetLsp.old" -Force
                Copy-Item -Force $lspSource $targetLsp
                Remove-Item "$targetLsp.old" -Force -ErrorAction SilentlyContinue
            }
        } else {
            Copy-Item -Force $lspSource $targetLsp
        }
        $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        $pathEntries = @($userPath -split ';' | Where-Object { $_ })
        if ($pathEntries -notcontains $zedBinDir) {
            [Environment]::SetEnvironmentVariable("PATH", (($pathEntries + $zedBinDir) -join ';'), "User")
            Write-Host "Added $zedBinDir to the user PATH." -ForegroundColor Green
        }
    } else {
        Write-Host "WARNING: snova-lsp.exe was not found; build snova-lsp first." -ForegroundColor Yellow
    }
    Write-Host "Extension installed to: $zedExtDir" -ForegroundColor Green
    Write-Host "Restart Zed and run 'zed: reload extensions' to activate." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done! To install in Zed, run: .\build.ps1 -Install" -ForegroundColor Cyan
