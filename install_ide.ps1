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

    $url    = "https://github.com/supernovalang/snova-lsp/archive/refs/heads/master.zip"
    $zip    = "$env:TEMP\snova-lsp.zip"
    $tmpDir = "$env:TEMP\snova-lsp-extract"
    $installDir = "$env:LOCALAPPDATA\snova-lsp\bin"

    Write-Host "Downloading LSP from $url..."
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

    Write-Host "Extracting LSP..."
    if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
    Expand-Archive -Path $zip -DestinationPath $tmpDir -Force
    Remove-Item $zip

    # O zip do GitHub extrai para uma subpasta snova-lsp-master/
    $extracted = Get-ChildItem $tmpDir -Directory | Select-Object -First 1
    if (-not $extracted) {
        Write-Host "ERROR: Could not find extracted folder in $tmpDir" -ForegroundColor Red
        exit 1
    }

    # Copia para o diretório de instalação (sem admin)
    if (Test-Path $installDir) { Remove-Item -Recurse -Force $installDir }
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Copy-Item -Recurse -Force "$($extracted.FullName)\*" $installDir
    Remove-Item -Recurse -Force $tmpDir

    Write-Host "Snovalang LSP installed to $installDir" -ForegroundColor Green

    # Adiciona ao PATH do usuário (sem admin)
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -notlike "*$installDir*") {
        [Environment]::SetEnvironmentVariable("PATH", "$userPath;$installDir", "User")
        Write-Host "Added $installDir to user PATH." -ForegroundColor Green
        Write-Host "Restart your terminal for PATH changes to take effect." -ForegroundColor Yellow
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
