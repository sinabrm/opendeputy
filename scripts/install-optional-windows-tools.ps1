[CmdletBinding()]
param(
  [switch]$LibreOffice,
  [switch]$Piper,
  [switch]$ActivityWatch,
  [switch]$All
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') { throw 'Optional OpenDeputy tools are supported by this installer on Windows only.' }

if ($All) {
  $LibreOffice = $true
  $Piper = $true
  $ActivityWatch = $true
}

if (-not ($LibreOffice -or $Piper -or $ActivityWatch)) {
  Write-Host 'Optional tools: [L]ibreOffice, [P]iper speech, [A]ctivityWatch, [All], or [Q]uit.'
  $choice = (Read-Host 'Choose what to install').Trim().ToLowerInvariant()
  switch ($choice) {
    'l' { $LibreOffice = $true }
    'p' { $Piper = $true }
    'a' { $ActivityWatch = $true }
    'all' { $LibreOffice = $Piper = $ActivityWatch = $true }
    default { Write-Host 'No optional tools installed.'; exit 0 }
  }
}

function Install-OptionalWingetPackage([string]$packageId) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is required to install $packageId."
  }
  & winget install --id $packageId --exact --source winget --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget failed to install $packageId (exit $LASTEXITCODE)." }
}

if ($LibreOffice) {
  Install-OptionalWingetPackage 'TheDocumentFoundation.LibreOffice'
  Write-Host 'LibreOffice installed for document preview/conversion.' -ForegroundColor Green
}

if ($Piper) {
  $piperVersion = '1.7.0'
  $piperSource = 'https://github.com/OHF-Voice/piper1-gpl'
  Write-Warning "Piper $piperVersion is an optional third-party tool licensed GPL-3.0-or-later. Source and license: $piperSource"

  $windowsArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  if ($windowsArchitecture -ne 'X64') {
    throw "Piper $piperVersion publishes a Windows AMD64 wheel only; this installer does not support $windowsArchitecture. Install a compatible Piper build manually and set OPENDEPUTY_PIPER_BINARY instead."
  }

  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if (-not $pythonCommand) { $pythonCommand = Get-Command py -ErrorAction SilentlyContinue }
  if (-not $pythonCommand) { throw 'Python 3 is required for Piper. Install Python, then run with -Piper again.' }

  $toolRoot = Join-Path $env:USERPROFILE '.open-deputy\workspace-tools'
  $venvRoot = Join-Path $toolRoot '.venv'
  New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null

  if ($pythonCommand.Name -eq 'py.exe') {
    & $pythonCommand.Source -3 -m venv $venvRoot
  } else {
    & $pythonCommand.Source -m venv $venvRoot
  }
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the Piper virtual environment.' }

  $venvPython = Join-Path $venvRoot 'Scripts\python.exe'
  & $venvPython -m pip install --disable-pip-version-check --upgrade "piper-tts==$piperVersion"
  if ($LASTEXITCODE -ne 0) { throw 'Could not install piper-tts.' }
  Write-Host "Piper $piperVersion installed from PyPI at $venvRoot. Add a compatible .onnx voice under $toolRoot\voices before speech synthesis." -ForegroundColor Green
}

if ($ActivityWatch) {
  Write-Warning 'ActivityWatch records application/window history when you run it. OpenDeputy reads it only after an explicit request.'
  Install-OptionalWingetPackage 'ActivityWatch.ActivityWatch'
  Write-Host 'ActivityWatch installed but not started by this script.' -ForegroundColor Green
}
