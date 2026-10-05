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
    & "$PSScriptRoot\install-vscode.ps1"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if ($selectedTags -contains "zed") {
    Write-Host "Installing Snovalang extension for Zed..." -ForegroundColor Cyan
    & "$PSScriptRoot\install-zed.ps1"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

exit 0
