param(
  [Parameter(Mandatory = $false)]
  [int]$Days = 14,

  [Parameter(Mandatory = $false)]
  [string]$HistoryPath = ".history",

  [Parameter(Mandatory = $false)]
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$message) {
  Write-Host "[prune-local-history] $message"
}

$root = Resolve-Path -LiteralPath $HistoryPath -ErrorAction SilentlyContinue
if (-not $root) {
  Write-Info "No history folder found at '$HistoryPath'. Nothing to do."
  exit 0
}

$cutoff = (Get-Date).AddDays(-$Days)
Write-Info "Pruning files older than $Days days (before $cutoff) under '$($root.Path)'."

$files = Get-ChildItem -LiteralPath $root.Path -Recurse -Force -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt $cutoff }

if (-not $files -or $files.Count -eq 0) {
  Write-Info "No files to prune."
  exit 0
}

$deletedCount = 0
$deletedBytes = 0
$candidateCount = 0
$candidateBytes = 0
foreach ($file in $files) {
  $candidateCount++
  $candidateBytes += $file.Length

  if ($DryRun) {
    Write-Info "[DryRun] Would delete: $($file.FullName)"
    continue
  }

  try {
    $deletedBytes += $file.Length
    Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
    $deletedCount++
  } catch {
    Write-Info "Failed to delete: $($file.FullName) ($($_.Exception.Message))"
  }
}

# Remove empty directories bottom-up
$dirs = Get-ChildItem -LiteralPath $root.Path -Recurse -Force -Directory -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending
foreach ($dir in $dirs) {
  try {
    $hasChildren = Get-ChildItem -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $hasChildren) {
      if ($DryRun) {
        Write-Info "[DryRun] Would remove empty dir: $($dir.FullName)"
      } else {
        Remove-Item -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    # ignore
  }
}

$mb = [math]::Round(($deletedBytes / 1MB), 1)
$candidateMb = [math]::Round(($candidateBytes / 1MB), 1)

if ($DryRun) {
  Write-Info "[DryRun] Would delete $candidateCount file(s), free ~${candidateMb}MB."
} else {
  Write-Info "Deleted $deletedCount file(s), freed ~${mb}MB."
}
