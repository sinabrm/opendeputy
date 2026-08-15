[CmdletBinding()]
param(
  [string]$ArtifactDirectory = 'packages/electron/dist',
  [switch]$LaunchSmoke
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') { throw 'The packaged release check must run on Windows.' }

$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot $ArtifactDirectory
$unpackedRoot = Join-Path $distRoot 'win-unpacked'
$resourcesRoot = Join-Path $unpackedRoot 'resources'

$requiredPaths = @(
  (Join-Path $unpackedRoot 'OpenDeputy.exe'),
  (Join-Path $resourcesRoot 'app.asar'),
  (Join-Path $resourcesRoot 'web-dist\index.html'),
  (Join-Path $resourcesRoot 'icons\icon.ico'),
  (Join-Path $resourcesRoot 'icons\tray'),
  (Join-Path $resourcesRoot 'opencode-cli\opencode.exe'),
  (Join-Path $resourcesRoot 'open-computer-use\dist\windows\amd64\open-computer-use.exe')
)

foreach ($requiredPath in $requiredPaths) {
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Packaged resource missing: $requiredPath" }
}

$installer = Get-ChildItem -LiteralPath $distRoot -File -Filter 'OpenDeputy-*-win-*.exe' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $installer) { throw "No OpenDeputy Windows installer found in $distRoot." }

$openCode = Join-Path $resourcesRoot 'opencode-cli\opencode.exe'
$openCodeVersion = (& $openCode --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $openCodeVersion) { throw 'Bundled OpenCode CLI did not report a version.' }

$computerUse = Join-Path $resourcesRoot 'open-computer-use\dist\windows\amd64\open-computer-use.exe'
$computerUseOutput = (& $computerUse call list_apps | Out-String)
if ($LASTEXITCODE -ne 0 -or $computerUseOutput -notmatch 'content') { throw 'Bundled Open Computer Use list_apps check failed.' }

$hash = Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256
$checksumPath = Join-Path $distRoot 'SHA256SUMS.txt'
"$($hash.Hash.ToLowerInvariant())  $($installer.Name)" | Set-Content -LiteralPath $checksumPath -Encoding ascii

$startupResult = 'not requested'
if ($LaunchSmoke) {
  $smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('open-deputy-smoke-' + [guid]::NewGuid().ToString('N'))
  $smokeAppData = Join-Path $smokeRoot 'AppData'
  $smokeLocalAppData = Join-Path $smokeRoot 'LocalAppData'
  New-Item -ItemType Directory -Path $smokeAppData, $smokeLocalAppData -Force | Out-Null
  $previousAppData = $env:APPDATA
  $previousLocalAppData = $env:LOCALAPPDATA
  $startedProcess = $null

  try {
    $env:APPDATA = $smokeAppData
    $env:LOCALAPPDATA = $smokeLocalAppData
    $startedProcess = Start-Process -FilePath (Join-Path $unpackedRoot 'OpenDeputy.exe') -ArgumentList '--disable-gpu' -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 20
    $runningProcess = Get-Process -Id $startedProcess.Id -ErrorAction SilentlyContinue
    if (-not $runningProcess) { throw 'Packaged OpenDeputy exited during clean-profile startup.' }

    $startupErrors = Get-ChildItem -LiteralPath $smokeRoot -Recurse -File -Filter '*.log' -ErrorAction SilentlyContinue |
      ForEach-Object { Get-Content -LiteralPath $_.FullName -ErrorAction SilentlyContinue } |
      Select-String -Pattern 'uncaught|fatal|failed to start|ENOENT' -CaseSensitive:$false
    if ($startupErrors) { throw "Packaged startup logs contain $($startupErrors.Count) fatal error line(s)." }
    $startupResult = 'clean profile stayed running for 20 seconds'
  } finally {
    $env:APPDATA = $previousAppData
    $env:LOCALAPPDATA = $previousLocalAppData
    if ($startedProcess -and -not $startedProcess.HasExited) {
      $null = $startedProcess.CloseMainWindow()
      if (-not $startedProcess.WaitForExit(10000)) {
        Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
      }
    }

    $resolvedUnpackedRoot = [System.IO.Path]::GetFullPath($unpackedRoot)
    Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        if ($_.Path -and $_.Path.StartsWith($resolvedUnpackedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
          Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
      } catch {
        # Ignore processes whose executable path cannot be inspected.
      }
    }

    $resolvedSmokeRoot = [System.IO.Path]::GetFullPath($smokeRoot)
    $safeTemporaryPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (-not $resolvedSmokeRoot.StartsWith($safeTemporaryPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not [System.IO.Path]::GetFileName($resolvedSmokeRoot).StartsWith('open-deputy-smoke-')) {
      throw "Unsafe smoke-test cleanup target: $resolvedSmokeRoot"
    }
    Remove-Item -LiteralPath $resolvedSmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

[pscustomobject]@{
  Installer = $installer.Name
  InstallerBytes = $installer.Length
  SHA256 = $hash.Hash.ToLowerInvariant()
  OpenCodeVersion = $openCodeVersion
  ComputerUse = 'list_apps passed'
  Startup = $startupResult
  ChecksumFile = $checksumPath
} | Format-List
