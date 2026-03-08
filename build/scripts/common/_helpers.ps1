$ErrorActionPreference = "Stop"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-AppVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $versionFile = Join-Path $RepoRoot "VERSION"
  if (!(Test-Path $versionFile)) {
    throw "Missing VERSION file at: $versionFile"
  }

  $version = (Get-Content -Path $versionFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($version)) {
    throw "VERSION file is empty"
  }

  if ($version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') {
    throw "Invalid version '$version'. Expected format: major.minor.patch or major.minor.patch.build"
  }

  return $version
}

function Set-ManifestVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,
    [Parameter(Mandatory = $true)]
    [string]$Version
  )

  if (!(Test-Path $ManifestPath)) {
    throw "Missing manifest file: $ManifestPath"
  }

  $manifestObject = Get-Content -Path $ManifestPath -Raw | ConvertFrom-Json
  $manifestObject.version = $Version

  $json = $manifestObject | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($ManifestPath, $json, $Utf8NoBom)
}

function Set-IndexFooterVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$HtmlPath,
    [Parameter(Mandatory = $true)]
    [string]$Version
  )

  if (!(Test-Path $HtmlPath)) {
    throw "Missing HTML file: $HtmlPath"
  }

  $html = Get-Content -Path $HtmlPath -Raw

  if ($html -match '<span id="app-version-value">.*?</span>') {
    $html = [regex]::Replace($html, '<span id="app-version-value">.*?</span>', '<span id="app-version-value">' + $Version + '</span>', 1)
  } else {
    throw "Version span not found in: $HtmlPath"
  }

  [System.IO.File]::WriteAllText($HtmlPath, $html, $Utf8NoBom)
}