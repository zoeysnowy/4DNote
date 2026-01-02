param(
  [string]$OutDir = "$PSScriptRoot\.vscode\_oom_logs_capture"
)

$ErrorActionPreference = 'Stop'

function Copy-IfExists([string]$src, [string]$dst) {
  if (Test-Path -LiteralPath $src) {
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    Copy-Item -Recurse -Force -LiteralPath $src -Destination $dst
    return $true
  }
  return $false
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$profiles = @(
  @{ Name = 'Code'; Base = Join-Path $env:APPDATA 'Code' },
  @{ Name = 'Code-Insiders'; Base = Join-Path $env:APPDATA 'Code - Insiders' }
)

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$destRoot = Join-Path $OutDir $stamp
New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

$copied = @()

foreach ($p in $profiles) {
  $base = $p.Base
  if (-not (Test-Path -LiteralPath $base)) { continue }

  $logsDir = Join-Path $base 'logs'
  if (Test-Path -LiteralPath $logsDir) {
    $latestLogFolders = Get-ChildItem -LiteralPath $logsDir -Directory | Sort-Object Name -Descending | Select-Object -First 3
    foreach ($f in $latestLogFolders) {
      $dst = Join-Path $destRoot (Join-Path $p.Name (Join-Path 'logs' $f.Name))
      Copy-IfExists -src $f.FullName -dst $dst | Out-Null
      $copied += "$($p.Name) logs $($f.Name)"
    }
  }

  $crashReports = Join-Path $base 'Crashpad\reports'
  if (Test-Path -LiteralPath $crashReports) {
    $dst = Join-Path $destRoot (Join-Path $p.Name 'Crashpad_reports')
    Copy-IfExists -src $crashReports -dst $dst | Out-Null
    $copied += "$($p.Name) Crashpad reports"
  }

  $crashMeta = Join-Path $base 'Crashpad\metadata'
  if (Test-Path -LiteralPath $crashMeta) {
    $dst = Join-Path $destRoot (Join-Path $p.Name 'Crashpad_metadata')
    Copy-IfExists -src $crashMeta -dst $dst | Out-Null
    $copied += "$($p.Name) Crashpad metadata"
  }
}

# Also capture isolated profiles if they exist in the workspace
$isolatedRoots = @(
  Join-Path $PSScriptRoot '.vscode\_oom_test_user_data',
  Join-Path $PSScriptRoot '.vscode\_oom_test_user_data_empty'
)
foreach ($r in $isolatedRoots) {
  if (Test-Path -LiteralPath $r) {
    $name = Split-Path -Leaf $r
    $dst = Join-Path $destRoot (Join-Path 'workspace_isolated' $name)
    Copy-IfExists -src $r -dst $dst | Out-Null
    $copied += "workspace isolated $name"
  }
}

$summaryPath = Join-Path $destRoot 'SUMMARY.txt'
$copied | Set-Content -Encoding UTF8 -LiteralPath $summaryPath

Write-Host "Captured to: $destRoot"
Write-Host "Items:"
$copied | ForEach-Object { Write-Host " - $_" }
