# Install snova-lsp into ~/.local/bin, the directory `make install` uses
# (PREFIX=$HOME/.local). On Windows the server build writes tools/bin/snova-lsp.exe;
# this script copies a host-matching binary there, or clones
# https://github.com/snovalang/snova-lsp and runs make.
$ErrorActionPreference = "Stop"

$prefix = if ($env:PREFIX) { $env:PREFIX } else { Join-Path $env:USERPROFILE ".local" }
$binDir = Join-Path $prefix "bin"
$dest = Join-Path $binDir "snova-lsp.exe"

function Read-Header([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $buf = New-Object byte[] 256
        $read = $stream.Read($buf, 0, 256)
        if ($read -lt 4) { return $null }
        return $buf[0..($read - 1)]
    } finally {
        $stream.Close()
    }
}

function Get-UInt16([byte[]]$buf, [int]$offset, [bool]$little) {
    if ($offset + 2 -gt $buf.Length) { return $null }
    if ($little) { return [int]$buf[$offset] -bor ([int]$buf[$offset + 1] -shl 8) }
    return ([int]$buf[$offset] -shl 8) -bor [int]$buf[$offset + 1]
}

function Get-UInt32([byte[]]$buf, [int]$offset, [bool]$little) {
    if ($offset + 4 -gt $buf.Length) { return $null }
    if ($little) {
        return [int]$buf[$offset] -bor ([int]$buf[$offset + 1] -shl 8) -bor ([int]$buf[$offset + 2] -shl 16) -bor ([int]$buf[$offset + 3] -shl 24)
    }
    return ([int]$buf[$offset] -shl 24) -bor ([int]$buf[$offset + 1] -shl 16) -bor ([int]$buf[$offset + 2] -shl 8) -bor [int]$buf[$offset + 3]
}

function Test-SnovaLspBinary([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $buf = Read-Header $Path
    if ($null -eq $buf) { return $false }
    $arch = $env:SNOVA_LSP_ASSUME_ARCH
    if (-not $arch) {
        switch ($env:PROCESSOR_ARCHITECTURE) {
            "AMD64" { $arch = "x64" }
            "ARM64" { $arch = "arm64" }
            "X86" { $arch = "ia32" }
            default { $arch = "unknown" }
        }
    }
    if ($buf[0] -ne 0x4D -or $buf[1] -ne 0x5A) { return $false }
    if ($buf.Length -lt 0x40) { return $arch -eq "unknown" }
    $lfanew = Get-UInt32 $buf 0x3C $true
    if (-not $lfanew -or ($lfanew + 6) -gt $buf.Length) { return $true }
    if ($buf[$lfanew] -ne 0x50 -or $buf[$lfanew + 1] -ne 0x45) { return $false }
    $machine16 = Get-UInt16 $buf ($lfanew + 4) $true
    $cpu = switch ($machine16) {
        0x14c { "ia32" }
        0x8664 { "x64" }
        0xAA64 { "arm64" }
        default { "" }
    }
    if (-not $cpu) { return $false }
    if ($arch -eq "unknown") { return $true }
    return $cpu -eq $arch
}

function Install-File([string]$Source) {
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    Copy-Item -LiteralPath $Source -Destination $dest -Force
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    $entries = @()
    if ($userPath) { $entries = @($userPath -split ';' | Where-Object { $_ }) }
    if ($entries -notcontains $binDir) {
        [Environment]::SetEnvironmentVariable("PATH", (($entries + $binDir) -join ';'), "User")
        Write-Host "Added $binDir to the user PATH."
    }
    Write-Host "Installed snova-lsp to $dest"
}

if ($env:SNOVA_LSP_BIN) {
    if (Test-SnovaLspBinary $env:SNOVA_LSP_BIN) {
        Install-File $env:SNOVA_LSP_BIN
        exit 0
    }
    Write-Host "snova-lsp binary does not match this system: $($env:SNOVA_LSP_BIN)"
    exit 1
}

function Build-Checkout([string]$Checkout) {
    $snovac = Join-Path (Split-Path -Parent $Checkout) "snovac"
    if (-not (Test-Path (Join-Path $snovac "Makefile"))) {
        git clone --depth 1 https://github.com/snovalang/snovac.git $snovac *>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { return $false }
    }
    $make = Get-Command make -ErrorAction SilentlyContinue
    if (-not $make) { $make = Get-Command mingw32-make -ErrorAction SilentlyContinue }
    if (-not $make) {
        Write-Host "make was not found. Install GNU make and a C compiler, or pass SNOVA_LSP_BIN."
        return $false
    }
    & $make.Source -C $Checkout all "SNOVAC_DIR=$snovac" *>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { return $false }
    $built = Join-Path $Checkout "tools\bin\snova-lsp.exe"
    if (-not (Test-Path -LiteralPath $built)) {
        $built = Join-Path $Checkout "build\snova-lsp.exe"
    }
    if (-not (Test-SnovaLspBinary $built)) {
        Write-Host "The build finished without producing snova-lsp.exe."
        return $false
    }
    Install-File $built
    return $true
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$checkout = $env:SNOVA_LSP_CHECKOUT
if (-not $checkout) {
    $sibling = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "..\snova-lsp"))
    if (Test-Path (Join-Path $sibling "src\lsp_transport.c")) { $checkout = $sibling }
}
if ($checkout -and -not $env:SNOVA_LSP_NO_BUILD) {
    if (Build-Checkout $checkout) { exit 0 }
    Write-Host "Build from $checkout failed. Trying a bundled binary."
}

$bundle = if ($env:SNOVA_LSP_BUNDLE_DIR) { $env:SNOVA_LSP_BUNDLE_DIR } else { Join-Path $repoRoot "vscode\server" }
$bundled = Join-Path $bundle "snova-lsp.exe"
if (Test-SnovaLspBinary $bundled) {
    Install-File $bundled
    exit 0
}

if (Test-SnovaLspBinary $dest) {
    Write-Host "snova-lsp is already installed at $dest"
    exit 0
}

if ($env:SNOVA_LSP_NO_BUILD) {
    Write-Host "No snova-lsp.exe matches this system, and SNOVA_LSP_NO_BUILD is set."
    exit 1
}

$cache = Join-Path $env:USERPROFILE ".cache\snova\src"
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$cached = Join-Path $cache "snova-lsp"
if (-not (Test-Path (Join-Path $cached "src\lsp_transport.c"))) {
    if (Test-Path $cached) { Remove-Item -Recurse -Force $cached }
    git clone --depth 1 https://github.com/snovalang/snova-lsp.git $cached
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if (-not (Build-Checkout $cached)) { exit 1 }
exit 0
