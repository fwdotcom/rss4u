$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
. (Join-Path $PSScriptRoot "_helpers.ps1")

$version = Get-AppVersion -RepoRoot $repoRoot
$htmlPath = Join-Path $repoRoot "public\index.html"

Set-IndexFooterVersion -HtmlPath $htmlPath -Version $version
$env:RSS4U_PREBUILD_DONE = "1"
Write-Output "Pre-build completed: synced website footer version to $version"