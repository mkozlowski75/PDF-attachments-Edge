param([Parameter(Mandatory=$true)][string]$ReleaseRoot)
$ErrorActionPreference = 'Stop'
$release = (Resolve-Path -LiteralPath $ReleaseRoot).Path
$upload = Join-Path $release 'Store-Paket'
$manifestPath = Join-Path $upload 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Store-Paket/manifest.json fehlt.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.key -or $manifest.update_url) { throw 'Das Store-Paket enthält noch eine Entwicklungskennung.' }
$version = $manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') { throw 'Ungültige Versionsnummer.' }
Compress-Archive -Path (Join-Path $upload '*') -DestinationPath (Join-Path $release "PDF-Anhaenge-Edge-$version-store.zip") -Force
Compress-Archive -LiteralPath (Join-Path $release 'Quellcode-MIT') -DestinationPath (Join-Path $release "PDF-Anhaenge-Edge-$version-MIT-Quellcode.zip") -Force
if (Test-Path -LiteralPath (Join-Path $release 'Windows-Netzwerk-Helfer')) {
    Compress-Archive -Path (Join-Path $release 'Windows-Netzwerk-Helfer\*') -DestinationPath (Join-Path $release "Windows-Netzwerk-Helfer-$version.zip") -Force
}
Write-Output 'Store-ZIP mit manifest.json im Hauptverzeichnis und separates Quellcode-ZIP erstellt.'
