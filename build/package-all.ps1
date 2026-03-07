$ErrorActionPreference = "Stop"

$buildRoot = Resolve-Path $PSScriptRoot

Write-Output "Building Chromium package..."
& (Join-Path $buildRoot "package-chromium.ps1")

Write-Output "Building Firefox package..."
& (Join-Path $buildRoot "package-firefox.ps1")

Write-Output "All extension packages built successfully."
