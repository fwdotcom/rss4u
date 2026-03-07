$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distRoot = Join-Path $PSScriptRoot "dist"
$tempRoot = Join-Path $env:TEMP "rss4u-packaging"
$stagingRoot = Join-Path $tempRoot "firefox"
$zipPath = Join-Path $distRoot "rss4u-firefox.zip"

if (!(Test-Path $distRoot)) {
  New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
}

$copyItems = @(
  "public"
)

if (Test-Path $stagingRoot) {
  Remove-Item $stagingRoot -Recurse -Force
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

foreach ($item in $copyItems) {
  $source = Join-Path $repoRoot $item
  if (Test-Path $source) {
    Copy-Item -Path $source -Destination $stagingRoot -Recurse -Force
  } else {
    throw "Missing required file/folder: $item"
  }
}

$backgroundSource = Join-Path $repoRoot "build\background.js"
$backgroundTarget = Join-Path $stagingRoot "background.js"
if (!(Test-Path $backgroundSource)) {
  throw "Missing build/background.js"
}
Copy-Item -Path $backgroundSource -Destination $backgroundTarget -Force

$manifestSource = Join-Path $repoRoot "build\manifests\manifest.firefox.json"
$manifestTarget = Join-Path $stagingRoot "manifest.json"
if (!(Test-Path $manifestSource)) {
  throw "Missing build/manifests/manifest.firefox.json"
}
Copy-Item -Path $manifestSource -Destination $manifestTarget -Force

Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
Write-Output "Created $zipPath"
