[CmdletBinding()]
param(
  [switch]$InstallMissing,
  [switch]$Launch,
  [switch]$SkipChecks
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') {
  throw 'OpenDeputy 1.19.0 setup supports Windows only.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Add-TaskPath([string]$candidate) {
  if ((Test-Path -LiteralPath $candidate) -and -not (($env:PATH -split ';') -contains $candidate)) {
    $env:PATH = "$candidate;$env:PATH"
  }
}

function Refresh-TaskPath {
  Add-TaskPath 'C:\Program Files\Git\cmd'
  Add-TaskPath (Join-Path $env:USERPROFILE '.bun\bin')
  $wingetRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path -LiteralPath $wingetRoot) {
    Get-ChildItem -LiteralPath $wingetRoot -Recurse -File -Filter 'bun.exe' -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -like '*Oven-sh.Bun_*' } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 |
      ForEach-Object { Add-TaskPath $_.DirectoryName }
  }
}

function Require-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'winget is required to install missing prerequisites. Install App Installer from Microsoft Store, then run this command again.'
  }
}

function Install-WingetPackage([string]$packageId) {
  Require-Winget
  Write-Host "Installing $packageId with winget..."
  & winget install --id $packageId --exact --source winget --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget failed to install $packageId (exit $LASTEXITCODE)." }
  Refresh-TaskPath
}

Refresh-TaskPath

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  if (-not $InstallMissing) { throw 'Git is missing. Run again with -InstallMissing.' }
  Install-WingetPackage 'Git.Git'
}

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  if (-not $InstallMissing) { throw 'Bun is missing. Run again with -InstallMissing.' }
  Install-WingetPackage 'Oven-sh.Bun'
}

$bunCommand = Get-Command bun -ErrorAction Stop
Write-Host "Using Git $(& git --version)"
Write-Host "Using Bun $(& $bunCommand.Source --version)"

& $bunCommand.Source install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "bun install failed (exit $LASTEXITCODE)." }

if (-not $SkipChecks) {
  & $bunCommand.Source run test:release-contract
  if ($LASTEXITCODE -ne 0) { throw 'Release contract checks failed.' }
  & $bunCommand.Source run type-check
  if ($LASTEXITCODE -ne 0) { throw 'Type checking failed.' }
}

Write-Host 'OpenDeputy development setup is ready.' -ForegroundColor Green

if ($Launch) {
  & $bunCommand.Source run electron:dev
  exit $LASTEXITCODE
}
