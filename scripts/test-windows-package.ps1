[CmdletBinding()]
param(
  [string]$ArtifactDirectory = 'packages/electron/dist',
  [switch]$LaunchSmoke
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') { throw 'The packaged release check must run on Windows.' }

function Get-Sha256Hex {
  param([Parameter(Mandatory = $true)][string]$LiteralPath)

  $stream = [System.IO.File]::OpenRead($LiteralPath)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $algorithm.ComputeHash($stream)
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }

  return ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot $ArtifactDirectory
$unpackedRoot = Join-Path $distRoot 'win-unpacked'
$resourcesRoot = Join-Path $unpackedRoot 'resources'

$requiredPaths = @(
  (Join-Path $unpackedRoot 'OpenDeputy.exe'),
  (Join-Path $unpackedRoot 'LICENSE.electron.txt'),
  (Join-Path $unpackedRoot 'LICENSES.chromium.html'),
  (Join-Path $resourcesRoot 'app.asar'),
  (Join-Path $resourcesRoot 'web-dist\index.html'),
  (Join-Path $resourcesRoot 'icons\icon.ico'),
  (Join-Path $resourcesRoot 'icons\tray'),
  (Join-Path $resourcesRoot 'opencode-cli\opencode.exe'),
  (Join-Path $resourcesRoot 'open-computer-use\dist\windows\amd64\open-computer-use.exe'),
  (Join-Path $resourcesRoot 'agent-kit\package.json'),
  (Join-Path $resourcesRoot 'agent-kit\servers\open-browser-use.mjs'),
  (Join-Path $resourcesRoot 'agent-kit\servers\agent-overlay\server.mjs'),
  (Join-Path $resourcesRoot 'agent-kit\servers\agent-overlay\overlay.ps1'),
  (Join-Path $resourcesRoot 'agent-kit\servers\visual-grounding\server.mjs'),
  (Join-Path $resourcesRoot 'agent-kit\servers\workspace-tools\server.mjs'),
  (Join-Path $resourcesRoot 'agent-kit\skills\computer-control\SKILL.md'),
  (Join-Path $resourcesRoot 'agent-kit\skills\desktop-workspace\SKILL.md'),
  (Join-Path $resourcesRoot 'agent-kit\skills\open-browser-use\SKILL.md'),
  (Join-Path $resourcesRoot 'agent-kit\skills\open-computer-use\SKILL.md'),
  (Join-Path $resourcesRoot 'agent-kit\node_modules\@playwright\mcp\cli.js'),
  (Join-Path $resourcesRoot 'agent-kit\node_modules\open-browser-use\native\windows-amd64\open-browser-use.exe'),
  (Join-Path $resourcesRoot 'agent-kit\node_modules\@zavora-ai\computer-use-mcp\dist\server.js'),
  (Join-Path $resourcesRoot 'agent-kit\node_modules\@zavora-ai\computer-use-mcp\computer-use-napi.win32-x64.node'),
  (Join-Path $resourcesRoot 'touchpoint-runtime\python.exe'),
  (Join-Path $resourcesRoot 'touchpoint-runtime\LICENSE.txt'),
  (Join-Path $resourcesRoot 'touchpoint-runtime\opendeputy-touchpoint-runtime.json'),
  (Join-Path $resourcesRoot 'touchpoint-runtime\Lib\site-packages\touchpoint\__init__.py'),
  (Join-Path $resourcesRoot 'legal\LICENSE'),
  (Join-Path $resourcesRoot 'legal\THIRD_PARTY_NOTICES.md'),
  (Join-Path $resourcesRoot 'legal\THIRD_PARTY_LICENSES.txt'),
  (Join-Path $resourcesRoot 'legal\OPEN_SOURCE_COMPONENTS.md'),
  (Join-Path $resourcesRoot 'legal\third-party\README.md'),
  (Join-Path $resourcesRoot 'legal\third-party\OpenCode-1.18.18-LICENSE.txt'),
  (Join-Path $resourcesRoot 'legal\third-party\Apache-2.0-LICENSE.txt'),
  (Join-Path $resourcesRoot 'legal\third-party\Flexoki-8d723bac-LICENSE.txt'),
  (Join-Path $resourcesRoot 'legal\third-party\Vitesse-2862595c-LICENSE.txt'),
  (Join-Path $resourcesRoot 'legal\third-party\Remix-Icon-4.9.0-LICENSE.txt')
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

$touchpointPython = Join-Path $resourcesRoot 'touchpoint-runtime\python.exe'
$previousPythonNoUserSite = $env:PYTHONNOUSERSITE
$previousPythonUtf8 = $env:PYTHONUTF8
try {
  $env:PYTHONNOUSERSITE = '1'
  $env:PYTHONUTF8 = '1'
  $touchpointOutput = (& $touchpointPython -c 'import json, touchpoint; print(json.dumps(touchpoint.diagnostics()))' | Out-String).Trim()
} finally {
  $env:PYTHONNOUSERSITE = $previousPythonNoUserSite
  $env:PYTHONUTF8 = $previousPythonUtf8
}
if ($LASTEXITCODE -ne 0 -or -not $touchpointOutput) { throw 'Bundled TouchPoint diagnostics failed.' }
$touchpointDiagnostics = $touchpointOutput | ConvertFrom-Json
if (-not $touchpointDiagnostics.backend.available -or -not $touchpointDiagnostics.input_provider.available) {
  throw 'Bundled TouchPoint Windows backend or input provider is unavailable.'
}

$hash = Get-Sha256Hex -LiteralPath $installer.FullName
$checksumPath = Join-Path $distRoot 'SHA256SUMS.txt'
"$hash  $($installer.Name)" | Set-Content -LiteralPath $checksumPath -Encoding ascii

$startupResult = 'not requested'
if ($LaunchSmoke) {
  $smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('opendeputy-smoke-' + [guid]::NewGuid().ToString('N'))
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
        -not [System.IO.Path]::GetFileName($resolvedSmokeRoot).StartsWith('opendeputy-smoke-')) {
      throw "Unsafe smoke-test cleanup target: $resolvedSmokeRoot"
    }
    Remove-Item -LiteralPath $resolvedSmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

[pscustomobject]@{
  Installer = $installer.Name
  InstallerBytes = $installer.Length
  SHA256 = $hash
  OpenCodeVersion = $openCodeVersion
  ComputerUse = 'list_apps passed'
  TouchPoint = 'Windows diagnostics passed'
  Startup = $startupResult
  ChecksumFile = $checksumPath
} | Format-List
