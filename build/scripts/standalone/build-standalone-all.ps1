$ErrorActionPreference = "Stop"

$commonRoot = Resolve-Path (Join-Path $PSScriptRoot "..\common")
. (Join-Path $commonRoot "_helpers.ps1")

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$standaloneRoot = Join-Path $repoRoot "standalone"
$distRoot = Join-Path $repoRoot "build\dist\standalone"
$tmpRoot = Join-Path $repoRoot "build\tmp\standalone-public"
$version = Get-AppVersion -RepoRoot $repoRoot

if ($env:RSS4U_PREBUILD_DONE -ne "1") {
  Write-Output "Running pre-build..."
  & (Join-Path $commonRoot "pre-build.ps1")
} else {
  Write-Output "Pre-build already done in this runtime context, skipping."
}

if (!(Test-Path $standaloneRoot)) {
  throw "Missing standalone project at: $standaloneRoot"
}

if (!(Test-Path (Join-Path $standaloneRoot "go.mod"))) {
  throw "Missing Go module file at: $(Join-Path $standaloneRoot "go.mod")"
}

if (!(Test-Path (Join-Path $standaloneRoot "main.go"))) {
  throw "Missing Go entrypoint at: $(Join-Path $standaloneRoot "main.go")"
}

$targets = @(
  @{ GOOS = "windows"; GOARCH = "amd64"; Ext = ".exe" },
  @{ GOOS = "windows"; GOARCH = "arm64"; Ext = ".exe" },
  @{ GOOS = "linux"; GOARCH = "amd64"; Ext = "" },
  @{ GOOS = "linux"; GOARCH = "arm64"; Ext = "" },
  @{ GOOS = "darwin"; GOARCH = "amd64"; Ext = "" },
  @{ GOOS = "darwin"; GOARCH = "arm64"; Ext = "" }
)

if (Test-Path $distRoot) {
  Remove-Item $distRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $distRoot -Force | Out-Null

$publicSource = Join-Path $repoRoot "public"
if (!(Test-Path $publicSource)) {
  throw "Missing public folder at: $publicSource"
}

$tempStandaloneRoot = Join-Path $tmpRoot "standalone"
if (Test-Path $tmpRoot) {
  Remove-Item $tmpRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempStandaloneRoot -Force | Out-Null

Copy-Item -Path (Join-Path $standaloneRoot "go.mod") -Destination (Join-Path $tempStandaloneRoot "go.mod") -Force
Copy-Item -Path (Join-Path $standaloneRoot "main.go") -Destination (Join-Path $tempStandaloneRoot "main.go") -Force

$embeddedPublicDir = Join-Path $tempStandaloneRoot "public"
New-Item -ItemType Directory -Path $embeddedPublicDir -Force | Out-Null
Copy-Item -Path (Join-Path $publicSource "*") -Destination $embeddedPublicDir -Recurse -Force
Write-Output "Synced public assets for embed in tmp: $embeddedPublicDir"

$previousGoos = $env:GOOS
$previousGoarch = $env:GOARCH
$previousCgo = $env:CGO_ENABLED
$previousGoWork = $env:GOWORK

Push-Location $tempStandaloneRoot
try {
  foreach ($target in $targets) {
    $osName = $target.GOOS
    $arch = $target.GOARCH
    $binaryName = "rss4u-" + $version + "-" + $osName + "-" + $arch + $target.Ext
    $binaryPath = Join-Path $distRoot $binaryName

    Write-Output "Building standalone binary for $osName/$arch..."
    $env:GOOS = $osName
    $env:GOARCH = $arch
    $env:CGO_ENABLED = "0"
    # Build from a temporary module; disable parent go.work discovery.
    $env:GOWORK = "off"
    go build -o $binaryPath .

    if ($LASTEXITCODE -ne 0) {
      throw "go build failed for $osName/$arch with exit code $LASTEXITCODE"
    }

    if (!(Test-Path $binaryPath)) {
      throw "Expected standalone binary missing after build: $binaryPath"
    }

    Write-Output "Created: $binaryPath"
  }
} finally {
  $env:GOOS = $previousGoos
  $env:GOARCH = $previousGoarch
  $env:CGO_ENABLED = $previousCgo
  $env:GOWORK = $previousGoWork
  Pop-Location
}

if (Test-Path $tmpRoot) {
  Remove-Item $tmpRoot -Recurse -Force
  Write-Output "Cleaned temporary build workspace: $tmpRoot"
}

Write-Output "Created standalone outputs in: $distRoot"
