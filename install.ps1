<#
.SYNOPSIS
    Installs or uninstalls Collage Maker for the current Windows user. No admin rights needed.

.DESCRIPTION
    Downloads the latest release from GitHub (or uses a local copy), installs it to
    %LOCALAPPDATA%\Programs\Collage Maker, adds a Start Menu shortcut that opens the app in its own
    Microsoft Edge / Chrome / Brave window, and registers it in Settings > Apps so it can be removed
    like any other app.

    One-line install from PowerShell:
        irm https://raw.githubusercontent.com/khoks/collage-maker/main/install.ps1 | iex

    Uninstall: Settings > Apps > Installed apps > Collage Maker > Uninstall, or
        & ([scriptblock]::Create((irm https://raw.githubusercontent.com/khoks/collage-maker/main/install.ps1))) -Uninstall

.PARAMETER Uninstall
    Remove Collage Maker, its shortcuts and its Settings > Apps entry.

.PARAMETER From
    A downloaded collage-maker.zip, or an extracted copy of it, to install instead of downloading.
    When this script is run from inside an extracted copy, that copy is used automatically.

.PARAMETER Version
    Release to install, for example 1.2.0. Default: the latest release.

.PARAMETER DesktopShortcut
    Also put a shortcut on the desktop.

.PARAMETER NoLaunch
    Do not open Collage Maker after installing.

.PARAMETER InstallDir
    Where to install. Default: %LOCALAPPDATA%\Programs\Collage Maker

.PARAMETER ShortcutFor
    Used by the Scoop manifest: only create a shortcut (at -ShortcutPath) for an existing copy in this folder.
#>
param(
    [switch]$Uninstall,
    [string]$From,
    [string]$Version = $env:COLLAGE_MAKER_VERSION,
    [switch]$DesktopShortcut,
    [switch]$NoLaunch,
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\Collage Maker'),
    [string]$ShortcutFor,
    [string]$ShortcutPath
)

# Everything lives inside functions so that running this through "irm | iex" never leaves variables
# or preference changes behind in your PowerShell session, and never closes it.

function Invoke-CollageMakerSetup {
    param($Options)
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is very slow with the progress bar on PowerShell 5.1

    $Repo = 'khoks/collage-maker'
    $AppName = 'Collage Maker'
    $UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CollageMaker'
    $StartMenuLink = Join-Path ([Environment]::GetFolderPath('Programs')) "$AppName.lnk"
    $DesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) "$AppName.lnk"

    function Write-Step([string]$Text) { Write-Host "  $Text" }

    # Finds Edge, Chrome or Brave: the App Paths registry first, then the usual install folders.
    function Get-Browser {
        foreach ($exe in 'msedge.exe', 'chrome.exe', 'brave.exe') {
            foreach ($hive in 'HKCU:', 'HKLM:') {
                $key = "$hive\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$exe"
                $path = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).'(default)'
                if ($path) {
                    $path = $path.Trim('"')
                    if (Test-Path -LiteralPath $path) { return $path }
                }
            }
        }
        $candidates = @(
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
            "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
            "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
            "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
        )
        foreach ($path in $candidates) { if ($path -and (Test-Path -LiteralPath $path)) { return $path } }
        return $null
    }

    # A shortcut that opens the app in its own browser window. It points straight at the browser,
    # so no console window flashes up the way it would with a .cmd target.
    function New-AppShortcut([string]$LinkPath, [string]$AppDir) {
        $html = Join-Path $AppDir 'collage-maker.html'
        $browser = Get-Browser
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($LinkPath)
        if ($browser) {
            $link.TargetPath = $browser
            $link.Arguments = '--app="' + ([System.Uri]$html).AbsoluteUri + '"'
        } else {
            $link.TargetPath = $html
            $link.Arguments = ''
        }
        $link.WorkingDirectory = $AppDir
        $link.IconLocation = (Join-Path $AppDir 'icons\collage-maker.ico') + ',0'
        $link.Description = 'Drop photos, get a clean 8K collage with white borders'
        $link.Save()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
    }

    function Get-AppVersion([string]$AppDir) {
        $html = Join-Path $AppDir 'collage-maker.html'
        $match = Select-String -LiteralPath $html -Pattern "const VERSION = '([^']+)'" | Select-Object -First 1
        if ($match) { return $match.Matches[0].Groups[1].Value }
        return 'unknown'
    }

    # Refuses to delete a folder unless it clearly holds Collage Maker, so a mistyped -InstallDir
    # can never wipe something else.
    function Assert-OurFolder([string]$Dir) {
        if (-not (Test-Path -LiteralPath $Dir)) { return }
        $items = @(Get-ChildItem -LiteralPath $Dir -Force)
        if ($items.Count -gt 0 -and -not (Test-Path -LiteralPath (Join-Path $Dir 'collage-maker.html'))) {
            throw "$Dir already exists and does not look like a Collage Maker install. Choose another -InstallDir."
        }
    }

    # ------------------------------------------------------------------ shortcut only (Scoop)
    if ($Options.ShortcutFor) {
        if (-not $Options.ShortcutPath) { throw '-ShortcutFor needs -ShortcutPath' }
        $parent = Split-Path -Parent $Options.ShortcutPath
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        New-AppShortcut $Options.ShortcutPath $Options.ShortcutFor
        return
    }

    $dir = $Options.InstallDir

    # ------------------------------------------------------------------ uninstall
    if ($Options.Uninstall) {
        Write-Host "Uninstalling $AppName..."
        foreach ($lnk in $StartMenuLink, $DesktopLink) {
            if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force; Write-Step "Removed $lnk" }
        }
        if (Test-Path -LiteralPath $UninstallKey) { Remove-Item -LiteralPath $UninstallKey -Recurse -Force; Write-Step 'Removed the Settings > Apps entry' }
        if (Test-Path -LiteralPath $dir) {
            Assert-OurFolder $dir
            if ((Get-Location).Path -like "$dir*") { Set-Location $env:TEMP }
            Remove-Item -LiteralPath $dir -Recurse -Force
            Write-Step "Removed $dir"
        }
        Write-Host "$AppName has been uninstalled."
        return
    }

    # ------------------------------------------------------------------ find the files to install
    $temp = Join-Path ([IO.Path]::GetTempPath()) ('collage-maker-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp | Out-Null
    try {
        $source = $Options.From
        if ($source) {
            $source = (Resolve-Path -LiteralPath $source).Path
        } elseif ($Options.ScriptRoot -and (Test-Path -LiteralPath (Join-Path $Options.ScriptRoot 'collage-maker.html'))) {
            $source = $Options.ScriptRoot   # running from inside an extracted download
        } else {
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
            if ($Options.Version) { $base = "https://github.com/$Repo/releases/download/v$($Options.Version.TrimStart('v'))" }
            else { $base = "https://github.com/$Repo/releases/latest/download" }
            $zip = Join-Path $temp 'collage-maker.zip'
            $sums = Join-Path $temp 'SHA256SUMS'
            Write-Host "Downloading $AppName from $base ..."
            Invoke-WebRequest -Uri "$base/collage-maker.zip" -OutFile $zip -UseBasicParsing
            Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile $sums -UseBasicParsing
            $expected = (Get-Content -LiteralPath $sums | Where-Object { $_ -match '\s\*?collage-maker\.zip$' } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
            $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
            if (-not $expected -or $actual -ne $expected.ToUpperInvariant()) { throw 'The download is corrupt (SHA-256 checksum mismatch). Please try again.' }
            Write-Step 'Checksum verified'
            $source = $zip
        }

        if ((Test-Path -LiteralPath $source -PathType Leaf) -and $source -like '*.zip') {
            $unpacked = Join-Path $temp 'unpacked'
            Expand-Archive -LiteralPath $source -DestinationPath $unpacked -Force
            $source = $unpacked
        }
        $html = Get-ChildItem -LiteralPath $source -Recurse -Filter 'collage-maker.html' | Select-Object -First 1
        if (-not $html) { throw "No collage-maker.html found in $source" }
        $bundle = $html.DirectoryName

        # -------------------------------------------------------------- install
        $installed = Get-AppVersion $bundle
        Write-Host "Installing $AppName $installed to $dir"
        if ((Resolve-Path -LiteralPath $bundle).Path.TrimEnd('\') -ne [IO.Path]::GetFullPath($dir).TrimEnd('\')) {
            Assert-OurFolder $dir
            if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Copy-Item -Path (Join-Path $bundle '*') -Destination $dir -Recurse -Force
            # Windows does not need the macOS/Linux files.
            foreach ($extra in 'collage-maker', 'install.sh', 'icons\collage-maker.icns') {
                $p = Join-Path $dir $extra
                if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
            }
        }

        New-AppShortcut $StartMenuLink $dir
        Write-Step 'Added to the Start menu'
        if ($Options.DesktopShortcut) { New-AppShortcut $DesktopLink $dir; Write-Step 'Added a desktop shortcut' }

        $sizeKB = [int]((Get-ChildItem -LiteralPath $dir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1KB)
        New-Item -Path $UninstallKey -Force | Out-Null
        $values = @{
            DisplayName          = $AppName
            DisplayVersion       = $installed
            Publisher            = 'Collage Maker contributors'
            DisplayIcon          = (Join-Path $dir 'icons\collage-maker.ico')
            InstallLocation      = $dir
            URLInfoAbout         = "https://github.com/$Repo"
            HelpLink             = "https://github.com/$Repo/issues"
            InstallDate          = (Get-Date -Format 'yyyyMMdd')
            UninstallString      = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dir\install.ps1`" -Uninstall -InstallDir `"$dir`""
            QuietUninstallString = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dir\install.ps1`" -Uninstall -InstallDir `"$dir`""
        }
        foreach ($name in $values.Keys) { New-ItemProperty -Path $UninstallKey -Name $name -Value $values[$name] -PropertyType String -Force | Out-Null }
        foreach ($name in 'NoModify', 'NoRepair') { New-ItemProperty -Path $UninstallKey -Name $name -Value 1 -PropertyType DWord -Force | Out-Null }
        New-ItemProperty -Path $UninstallKey -Name 'EstimatedSize' -Value $sizeKB -PropertyType DWord -Force | Out-Null
        Write-Step 'Registered in Settings > Apps (uninstall it from there)'

        Write-Host ''
        Write-Host "$AppName $installed is installed. Open it from the Start menu, or run:"
        Write-Host "  `"$dir\collage-maker.cmd`""
        if (-not $Options.NoLaunch -and -not $env:CI) { Start-Process -FilePath $StartMenuLink }
    } finally {
        Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Invoke-CollageMakerSetup @{
    Uninstall       = [bool]$Uninstall
    From            = $From
    Version         = $Version
    DesktopShortcut = [bool]$DesktopShortcut
    NoLaunch        = [bool]$NoLaunch
    InstallDir      = $InstallDir
    ShortcutFor     = $ShortcutFor
    ShortcutPath    = $ShortcutPath
    ScriptRoot      = $PSScriptRoot
}
