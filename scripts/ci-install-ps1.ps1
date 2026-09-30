# CI helper: installs Collage Maker with install.ps1 from a local zip, checks everything it should
# have created, then uninstalls it the way Settings > Apps does and checks that nothing is left.
param(
    [Parameter(Mandatory = $true)][string]$Zip,
    [switch]$AsScriptBlock   # run the installer the way "irm ... | iex" does (no script file path)
)
$ErrorActionPreference = 'Stop'
$env:CI = 'true'

function Assert([bool]$Condition, [string]$What) {
    if (-not $Condition) { throw "FAILED: $What" }
    Write-Host "ok: $What"
}

$dir = Join-Path $env:RUNNER_TEMP 'Collage Maker (install test)'
$installer = (Resolve-Path 'install.ps1').Path
if ($AsScriptBlock) {
    & ([scriptblock]::Create((Get-Content -Raw -LiteralPath $installer))) -From $Zip -InstallDir $dir -DesktopShortcut
} else {
    & $installer -From $Zip -InstallDir $dir -DesktopShortcut
}

$programs = [Environment]::GetFolderPath('Programs')
$desktop = [Environment]::GetFolderPath('Desktop')
$startLink = Join-Path $programs 'Collage Maker.lnk'
$deskLink = Join-Path $desktop 'Collage Maker.lnk'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CollageMaker'

Assert (Test-Path -LiteralPath (Join-Path $dir 'collage-maker.html')) 'app file installed'
Assert (Test-Path -LiteralPath (Join-Path $dir 'icons\collage-maker.ico')) 'icon installed'
Assert (-not (Test-Path -LiteralPath (Join-Path $dir 'collage-maker'))) 'macOS/Linux launcher left out'
Assert (Test-Path -LiteralPath $startLink) 'Start menu shortcut created'
Assert (Test-Path -LiteralPath $deskLink) 'desktop shortcut created'
$link = (New-Object -ComObject WScript.Shell).CreateShortcut($startLink)
Assert ($link.TargetPath -match '(msedge|chrome|brave)\.exe$') "shortcut starts the browser directly: $($link.TargetPath)"
Assert ($link.Arguments -like '--app="file:///*collage-maker.html"') "shortcut opens the app window: $($link.Arguments)"
$reg = Get-ItemProperty -LiteralPath $key
Assert ($reg.DisplayVersion -eq (Get-Content VERSION).Trim()) "Settings > Apps entry shows version $($reg.DisplayVersion)"
$out = & cmd.exe /d /c "`"$dir\collage-maker.cmd`" --version"
Assert ($out -match '^collage-maker \d+\.\d+\.\d+$') "installed launcher runs: $out"

& cmd.exe /d /s /c $reg.UninstallString
Assert ($LASTEXITCODE -eq 0) 'uninstaller exited cleanly'
Assert (-not (Test-Path -LiteralPath $dir)) 'install folder removed'
Assert (-not (Test-Path -LiteralPath $startLink)) 'Start menu shortcut removed'
Assert (-not (Test-Path -LiteralPath $deskLink)) 'desktop shortcut removed'
Assert (-not (Test-Path -LiteralPath $key)) 'Settings > Apps entry removed'
