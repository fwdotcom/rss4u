param(
  [switch]$SkipDistClean
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "..\common\_helpers.ps1")

if ($env:RSS4U_PREBUILD_DONE -ne "1") {
  & (Join-Path $PSScriptRoot "..\common\pre-build.ps1")
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$distRoot = Join-Path $repoRoot "build\dist\extensions"
$tempRoot = Join-Path $env:TEMP "rss4u-packaging"
$stagingRoot = Join-Path $tempRoot "chromium"
$version = Get-AppVersion -RepoRoot $repoRoot
$zipPath = Join-Path $distRoot ("rss4u-chromium-" + $version + ".zip")

if (-not $SkipDistClean -and (Test-Path $distRoot)) {
  Remove-Item $distRoot -Recurse -Force
}

if (!(Test-Path $distRoot)) {
  New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
}

$copyItems = @(
  "public"
)

if (Test-Path $stagingRoot) {
  Remove-Item $stagingRoot -Recurse -Force
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

$backgroundSource = Join-Path $repoRoot "build\configs\extensions\background.js"
$backgroundTarget = Join-Path $stagingRoot "background.js"
if (!(Test-Path $backgroundSource)) {
  throw "Missing build/configs/extensions/background.js"
}
Copy-Item -Path $backgroundSource -Destination $backgroundTarget -Force

$manifestSource = Join-Path $repoRoot "build\configs\extensions\manifest.chromium.json"
$manifestTarget = Join-Path $stagingRoot "manifest.json"
if (!(Test-Path $manifestSource)) {
  throw "Missing build/configs/extensions/manifest.chromium.json"
}
Copy-Item -Path $manifestSource -Destination $manifestTarget -Force

Set-ManifestVersion -ManifestPath $manifestTarget -Version $version
Set-IndexFooterVersion -HtmlPath (Join-Path $stagingRoot "public\index.html") -Version $version

function New-ZipFromFolderWithUnixPaths {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceFolder,
    [Parameter(Mandatory = $true)]
    [string]$DestinationZip
  )

  if (Test-Path $DestinationZip) {
    Remove-Item $DestinationZip -Force
  }

  $sourceFull = (Resolve-Path $SourceFolder).Path
  $zipArchive = [System.IO.Compression.ZipFile]::Open($DestinationZip, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    $files = Get-ChildItem -Path $sourceFull -File -Recurse
    foreach ($file in $files) {
      $relativePath = ($file.FullName.Substring($sourceFull.Length + 1) -replace "\\", "/")
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $file.FullName, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally {
    $zipArchive.Dispose()
  }
}

New-ZipFromFolderWithUnixPaths -SourceFolder $stagingRoot -DestinationZip $zipPath
Write-Output "Created $zipPath"
