param(
  [switch]$Execute,
  [ValidateSet('conservative','aggressive')]
  [string]$Mode = 'conservative',
  [switch]$KeepFullBackup,
  [string]$BackupDir = "",
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$vendoredRoot = Join-Path $root 'src\lib\tui.calendar'
$calendarPkg = Join-Path $vendoredRoot 'apps\calendar'

if (-not (Test-Path -LiteralPath $vendoredRoot)) {
  Write-Output "[skip] Not found: $vendoredRoot" | Out-String
  exit 0
}
if (-not (Test-Path -LiteralPath $calendarPkg)) {
  Write-Output "[error] Not found: $calendarPkg" | Out-String
  exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
if ([string]::IsNullOrWhiteSpace($BackupDir)) {
  $BackupDir = Join-Path $root ("vendor\\_tui.calendar_full_backup_" + $stamp)
}

# What we keep to preserve runtime + typings
$keep = @(
  (Join-Path $calendarPkg 'package.json'),
  (Join-Path $calendarPkg 'dist'),
  (Join-Path $calendarPkg 'types')
)

function Count-Files([string]$path) {
  try {
    return ([System.IO.Directory]::EnumerateFiles($path,'*',[System.IO.SearchOption]::AllDirectories) | Measure-Object).Count
  } catch {
    return $null
  }
}

$beforeCount = Count-Files $vendoredRoot
$calDistCount = Count-Files (Join-Path $calendarPkg 'dist')
$calTypesCount = Count-Files (Join-Path $calendarPkg 'types')

$pathsToRemove = @(
  (Join-Path $vendoredRoot 'node_modules'),
  (Join-Path $vendoredRoot 'apps\react-calendar'),
  (Join-Path $vendoredRoot 'apps\vue-calendar'),
  (Join-Path $calendarPkg 'node_modules')
)

if ($Mode -eq 'aggressive') {
  $pathsToRemove += @(
    (Join-Path $calendarPkg 'src'),
    (Join-Path $calendarPkg 'examples'),
    (Join-Path $calendarPkg 'stories'),
    (Join-Path $calendarPkg 'playwright'),
    (Join-Path $calendarPkg 'scripts'),
    (Join-Path $calendarPkg 'test'),
    (Join-Path $calendarPkg 'docs'),
    (Join-Path $calendarPkg '.storybook')
  )
}

$plan = @()
$plan += "[info] Vendored root: $vendoredRoot"
$plan += "[info] Calendar package: $calendarPkg"
$plan += "[info] Mode: $Mode"
$plan += "[info] Files before: $beforeCount"
$plan += "[info] Keep:"
$keep | ForEach-Object { $plan += "  - $_" }
$plan += "[info] dist files: $calDistCount"
$plan += "[info] types files: $calTypesCount"

# Everything under src/lib/tui.calendar that is NOT part of the keep set is eligible to remove.
# We do it in two stages:
# 1) Optionally backup the full vendored root to vendor/ (for rollback)
# 2) Remove heavy folders/files, but keep apps/calendar/dist+types+package.json

$plan += "[plan] Remove paths:"
foreach ($p in $pathsToRemove) { $plan += "  - $p" }

if ($Mode -eq 'conservative') {
  $plan += "[note] Conservative mode keeps apps/calendar/src (so you can still patch TUI internals if needed)."
  $plan += "[note] Runtime still uses dist; if you edit src, you would still need to rebuild dist separately."
} else {
  $plan += "[note] Aggressive mode removes apps/calendar/src and most dev/test assets; best for VS Code stability."
}

$planText = ($plan | Out-String)
Write-Output $planText

if (-not $Execute) {
  Write-Output "[dry-run] No changes made. Re-run with -Execute to apply." | Out-String
  exit 0
}

# Safety: ensure keep paths exist
foreach ($k in $keep) {
  if (-not (Test-Path -LiteralPath $k)) {
    throw "Keep path missing: $k"
  }
}

if ($KeepFullBackup) {
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  Write-Output "[backup] Copying full vendored tui.calendar to: $BackupDir" | Out-String
  # Use robocopy for performance and stability
  $null = cmd /c "robocopy \"$vendoredRoot\" \"$BackupDir\" /E /R:1 /W:1 /NFL /NDL /NJH /NJS"
}

# Helper to remove if exists
function Remove-Path([string]$p) {
  if (Test-Path -LiteralPath $p) {
    if ($WhatIf) {
      Write-Output "[whatif] remove: $p" | Out-String
      return
    }
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Remove paths for selected mode
foreach ($p in $pathsToRemove) {
  Remove-Path $p
}

$afterCount = Count-Files $vendoredRoot
@(
  "[done] Files after: $afterCount",
  "[note] If anything breaks, restore from backup: $BackupDir (if you used -KeepFullBackup)"
) | Out-String
