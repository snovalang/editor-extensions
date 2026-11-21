# Install the prebuilt Snovalang plugin from the latest GitHub release into
# every JetBrains IDE 2025.1 or newer found for this user. Restart the IDEs
# afterwards. Open-source IntelliJ IDEA (IdeaIC) and PyCharm CE builds lack the
# LSP API the plugin uses, so they are skipped.
$ErrorActionPreference = "Stop"

$repo = "snovalang/editor-extensions"
$url = if ($env:SNOVA_JETBRAINS_URL) { $env:SNOVA_JETBRAINS_URL } else { "https://github.com/$repo/releases/latest/download/snovalang-jetbrains.zip" }
$configRoot = Join-Path $env:APPDATA "JetBrains"
if (-not (Test-Path $configRoot)) { throw "No JetBrains IDE configuration found in $configRoot" }

$tmp = Join-Path $env:TEMP ("snovalang-jetbrains-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
    $archive = Join-Path $tmp "snovalang-jetbrains.zip"
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
    $unpacked = Join-Path $tmp "unpacked"
    Expand-Archive -Path $archive -DestinationPath $unpacked
    $plugin = Get-ChildItem $unpacked -Directory | Select-Object -First 1
    if (-not $plugin -or -not (Get-ChildItem (Join-Path $plugin.FullName "lib") -Filter *.jar -ErrorAction SilentlyContinue)) {
        throw "Archive is incomplete: no plugin jar"
    }

    $count = 0
    foreach ($dir in Get-ChildItem $configRoot -Directory) {
        if ($dir.Name -notmatch '^([A-Za-z]+)(20\d\d)\.(\d+)$') { continue }
        if (@("IdeaIC", "PyCharmCE") -contains $Matches[1]) { continue }
        $year = [int]$Matches[2]; $minor = [int]$Matches[3]
        if ($year -lt 2025 -or ($year -eq 2025 -and $minor -lt 1)) { continue }

        $plugins = Join-Path $dir.FullName "plugins"
        New-Item -ItemType Directory -Force -Path $plugins | Out-Null
        $target = Join-Path $plugins $plugin.Name
        if (Test-Path $target) { Remove-Item -Recurse -Force $target }
        Copy-Item -Recurse $plugin.FullName $target
        Write-Host "Installed Snovalang into $($dir.Name) ($target)"
        $count++
    }
    if ($count -eq 0) {
        throw "No JetBrains IDE 2025.1 or newer found. Use Settings | Plugins | gear icon | Install Plugin from Disk..."
    }
    Write-Host "Restart the IDE(s) to load the plugin."
} finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
}
