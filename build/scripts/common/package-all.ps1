param(
  [switch]$ExtensionsOnly
)

$ErrorActionPreference = "Stop"

$commonRoot = Resolve-Path $PSScriptRoot
$extensionsRoot = Resolve-Path (Join-Path $PSScriptRoot "..\extensions")
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$extensionsDistRoot = Join-Path $repoRoot "build\dist\extensions"

if ($env:RSS4U_PREBUILD_DONE -ne "1") {
  Write-Output "Running pre-build..."
  & (Join-Path $commonRoot "pre-build.ps1")
} else {
  Write-Output "Pre-build already done in this runtime context, skipping."
}

Write-Output "Building Chromium package..."
if (Test-Path $extensionsDistRoot) {
  Remove-Item $extensionsDistRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $extensionsDistRoot -Force | Out-Null

& (Join-Path $extensionsRoot "package-chromium.ps1") -SkipDistClean

Write-Output "Building Firefox package..."
& (Join-Path $extensionsRoot "package-firefox.ps1") -SkipDistClean

if ($ExtensionsOnly) {
  Write-Output "All extension packages built successfully."
  return
}

$standaloneAllScript = Join-Path $PSScriptRoot "..\standalone\build-standalone-all.ps1"
if (Test-Path $standaloneAllScript) {
  Write-Output "Building standalone packages..."
  & $standaloneAllScript
} else {
  Write-Output "Standalone build-standalone-all script not found, skipping standalone build."
}

Write-Output "All requested packages built successfully."
