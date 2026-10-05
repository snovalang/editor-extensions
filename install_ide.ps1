# install_ide.ps1
# Interactive IDE setup script for PowerShell
# Presents a menu allowing the user to select one or more IDEs and the Default Snovalang LSP.
# The selection is done by entering space‑separated numbers and confirming with Enter.

# Define the options (index starts at 1)
$options = @(
    @{ Id = 1; Tag = "default"; Label = "Default Snovalang LSP" }
    @{ Id = 2; Tag = "vscode";  Label = "Visual Studio Code" }
    @{ Id = 3; Tag = "zed";     Label = "Zed" }
)

function Show-Menu {
    Write-Host "Choose a setup for your IDE:" -ForegroundColor Cyan
    Write-Host "-- Toggle options using Space (enter numbers separated by spaces) --"
    Write-Host "-- Submit on Enter --`n"
    foreach ($opt in $options) {
        Write-Host "[$($opt.Id)] $($opt.Label)"
    }
    Write-Host "`nEnter your choice(s): " -NoNewline
    $input = Read-Host
    return $input
}

$input = Show-Menu
if ([string]::IsNullOrWhiteSpace($input)) {
    Write-Host "No option selected. Exiting."
    exit 0
}

# Parse numbers
$selectedIds = $input -split '\s+' | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ }
$selectedTags = @()
foreach ($id in $selectedIds) {
    $match = $options | Where-Object { $_.Id -eq $id }
    if ($null -ne $match) { $selectedTags += $match.Tag }
}

if ($selectedTags.Count -eq 0) {
    Write-Host "No valid option selected. Exiting."
    exit 0
}

function Print-Status($tag, $label) {
    if ($selectedTags -contains $tag) {
        Write-Host "(x) $label"
    } else {
        Write-Host "( ) $label"
    }
}

Write-Host "You selected:`n"
Print-Status "default" "Default Snovalang LSP"
Print-Status "vscode"  "Visual Studio Code"
Print-Status "zed"     "Zed"

# Placeholder for actual installation logic
if ($selectedTags -contains "default") {
    Write-Host "Installing Default Snovalang LSP..." -ForegroundColor Cyan

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $installer = [System.IO.Path]::GetFullPath((Join-Path $scriptDir "..\snova-lsp\install.ps1"))
    if (Test-Path -LiteralPath $installer) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } else {
        Write-Host "Local checkout not found. Running the published installer..." -ForegroundColor Yellow
        $published = Join-Path $env:TEMP "snova-lsp-install.ps1"
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/supernovalang/snova-lsp/master/install.ps1" -OutFile $published -UseBasicParsing
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $published
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}
if ($selectedTags -contains "vscode") {
    Write-Host "Installing Snovalang extension for VS Code..." -ForegroundColor Cyan

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $vsCodeSrc = Join-Path $scriptDir "vscode"
    $pkg = Get-Content -LiteralPath (Join-Path $vsCodeSrc "package.json") -Raw | ConvertFrom-Json
    $targetDir = Join-Path $env:USERPROFILE ".vscode\extensions\$($pkg.publisher).$($pkg.name)-$($pkg.version)"

    $outJs = Join-Path $vsCodeSrc "out\extension.js"
    if (-not (Test-Path -LiteralPath $outJs)) {
        Write-Host "Compiling the VS Code extension..." -ForegroundColor Cyan
        Push-Location $vsCodeSrc
        try {
            if (-not (Test-Path -LiteralPath "node_modules")) {
                & npm install
                if ($LASTEXITCODE -ne 0) { throw "npm install failed in $vsCodeSrc" }
            }
            & npx --no-install tsc -p .
            if ($LASTEXITCODE -ne 0) {
                & npx tsc -p .
                if ($LASTEXITCODE -ne 0) { throw "tsc failed in $vsCodeSrc" }
            }
        } finally {
            Pop-Location
        }
    }

    if (Test-Path $targetDir) {
        Remove-Item -Recurse -Force $targetDir
    }
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

    Copy-Item -Path (Join-Path $vsCodeSrc "package.json") -Destination $targetDir -Force
    Copy-Item -Path (Join-Path $vsCodeSrc "language-configuration.json") -Destination $targetDir -Force
    Copy-Item -Path (Join-Path $vsCodeSrc "README.md") -Destination $targetDir -Force
    Copy-Item -Recurse -Force (Join-Path $vsCodeSrc "out") $targetDir
    Copy-Item -Recurse -Force (Join-Path $vsCodeSrc "snippets") $targetDir
    Copy-Item -Recurse -Force (Join-Path $vsCodeSrc "syntaxes") $targetDir
    if (Test-Path (Join-Path $vsCodeSrc "node_modules")) {
        Copy-Item -Recurse -Force (Join-Path $vsCodeSrc "node_modules") $targetDir
    }

    Write-Host "[OK] Snovalang extension installed to: $targetDir" -ForegroundColor Green
    Write-Host "Restart or reload VS Code (Ctrl+Shift+P -> 'Developer: Reload Window') to activate." -ForegroundColor Yellow
}
if ($selectedTags -contains "zed") {
    Write-Host "Installing Snovalang extension for Zed..." -ForegroundColor Cyan

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $zedExtensionSrc = Join-Path $scriptDir "zed"

    # Determine Zed extensions directory based on OS
    $zedRoot = if ($env:LOCALAPPDATA) { "$env:LOCALAPPDATA\Zed" } else { "$env:APPDATA\Zed" }
    $zedExtDir = "$zedRoot\extensions\installed\snovalang"
    $zedBinDir = "$zedRoot\tools\bin"

    if (-not (Test-Path $zedExtensionSrc)) {
        Write-Host "ERROR: Zed extension source not found at: $zedExtensionSrc" -ForegroundColor Red
        exit 1
    }

    # Remove previous installation if exists
    if (Test-Path $zedExtDir) {
        Remove-Item -Recurse -Force $zedExtDir
        Write-Host "Removed previous Zed extension installation."
    }

    # Copy extension files to Zed extensions directory
    New-Item -ItemType Directory -Force -Path (Split-Path $zedExtDir) | Out-Null
    if (Test-Path $zedExtDir) { Remove-Item -Recurse -Force $zedExtDir }
    Copy-Item -Recurse -Force $zedExtensionSrc $zedExtDir
    New-Item -ItemType Directory -Force -Path $zedBinDir | Out-Null
    $lspCandidates = @(
        (Join-Path $scriptDir "..\snova-lsp\tools\bin\snova-lsp.exe"),
        (Join-Path $scriptDir "..\snova-lsp\build\snova-lsp.exe"),
        (Join-Path $env:USERPROFILE ".snova\bin\snova-lsp.exe")
    ) | ForEach-Object { [System.IO.Path]::GetFullPath($_) }
    $lspSource = $lspCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($lspSource) {
        $installedLsp = Join-Path $zedBinDir "snova-lsp.exe"
        if (Test-Path $installedLsp) { Remove-Item -Force $installedLsp }
        Copy-Item -Force $lspSource $installedLsp
        $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        $pathEntries = @($userPath -split ';' | Where-Object { $_ })
        if ($pathEntries -notcontains $zedBinDir) {
            [Environment]::SetEnvironmentVariable("PATH", (($pathEntries + $zedBinDir) -join ';'), "User")
            Write-Host "Added $zedBinDir to the user PATH." -ForegroundColor Green
        }
    } else {
        Write-Host "WARNING: snova-lsp.exe was not found; build snova-lsp first." -ForegroundColor Yellow
    }
    Write-Host "Snovalang Zed extension installed to: $zedExtDir" -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANT: Restart Zed and run 'zed: reload extensions' (Ctrl+Shift+P) to activate." -ForegroundColor Yellow
}

exit 0
