# CI helper: installs Collage Maker with Scoop, using bucket/collage-maker.json pointed at the zip that
# scripts/build.mjs just built (served on localhost), then checks the command, the Start menu
# shortcut created by post_install, and that uninstalling removes it again.
$ErrorActionPreference = 'Stop'

function Assert([bool]$Condition, [string]$What) {
    if (-not $Condition) { throw "FAILED: $What" }
    Write-Host "ok: $What"
}

if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
    Invoke-RestMethod get.scoop.sh | Invoke-Expression
}
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"

$dist = (Resolve-Path 'dist').Path
$version = (Get-Content VERSION).Trim()
$hash = (Get-FileHash (Join-Path $dist 'collage-maker.zip') -Algorithm SHA256).Hash.ToLowerInvariant()
$port = 8931
$server = Start-Process python -ArgumentList '-m', 'http.server', $port, '--bind', '127.0.0.1', '--directory', $dist -PassThru -WindowStyle Hidden
try {
    for ($i = 0; $i -lt 30; $i++) {
        try { Invoke-WebRequest "http://127.0.0.1:$port/SHA256SUMS" -UseBasicParsing | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
    }

    $manifest = Get-Content -Raw bucket\collage-maker.json | ConvertFrom-Json
    $manifest.version = $version
    $manifest.url = "http://127.0.0.1:$port/collage-maker.zip"
    $manifest.hash = $hash
    $manifest.extract_dir = "collage-maker-$version"
    $bucket = Join-Path $env:RUNNER_TEMP 'scoop-local'
    New-Item -ItemType Directory -Path $bucket -Force | Out-Null
    $file = Join-Path $bucket 'collage-maker.json'
    $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $file -Encoding utf8

    scoop install $file
    Assert ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) 'scoop install succeeded'

    $out = & collage-maker --version
    Assert ("$out" -match "^collage-maker $([regex]::Escape($version))$") "collage-maker command works: $out"

    $link = Join-Path ([Environment]::GetFolderPath('Programs')) 'Scoop Apps\Collage Maker.lnk'
    Assert (Test-Path -LiteralPath $link) 'Start menu shortcut created by post_install'
    $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($link)
    Assert ($lnk.TargetPath -match '(msedge|chrome|brave)\.exe$') "shortcut starts the browser directly: $($lnk.TargetPath)"
    Assert ($lnk.Arguments -like '--app="file:///*/apps/collage-maker/current/collage-maker.html"') "shortcut opens the app window: $($lnk.Arguments)"

    scoop uninstall collage-maker
    Assert (-not (Test-Path -LiteralPath $link)) 'shortcut removed on uninstall'
    Assert (-not (Get-Command collage-maker -ErrorAction SilentlyContinue)) 'command removed on uninstall'
} finally {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
