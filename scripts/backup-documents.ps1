# =============================================================================
# Arkon Document Backup Script (PowerShell)
# =============================================================================
#
# Backs up the arkon-documents volume to a compressed archive.
#
# Usage:
#   .\scripts\backup-documents.ps1 [-DestDir <path>] [-RetentionDays <days>]
#
# Examples:
#   .\scripts\backup-documents.ps1                           # Backs up to .\backups\
#   .\scripts\backup-documents.ps1 -DestDir D:\backup        # Backs up to D:\backup\
#
# =============================================================================

param(
    [string]$DestDir = ".\backups",
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

# Configuration
$VolumeName = "arkon-workstation_arkon-documents"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupName = "arkon-documents-${Timestamp}.tar.gz"

# Create destination directory
if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
}

$DestDir = Resolve-Path $DestDir
$BackupPath = Join-Path $DestDir $BackupName

Write-Host "==> Starting backup of $VolumeName" -ForegroundColor Cyan
Write-Host "    Backup file: $BackupName"
Write-Host "    Destination: $DestDir"

# Create backup using a temporary container
Write-Host "==> Creating archive..." -ForegroundColor Cyan

# Convert Windows path to Docker-compatible path
$DockerDestDir = $DestDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'

docker run --rm `
    -v "${VolumeName}:/data:ro" `
    -v "${DockerDestDir}:/backup" `
    alpine:3.19 `
    sh -c "cd /data && tar czf /backup/${BackupName} ."

if ($LASTEXITCODE -ne 0) {
    Write-Host "!!! Backup failed!" -ForegroundColor Red
    exit 1
}

$BackupSize = (Get-Item $BackupPath).Length / 1MB
Write-Host "==> Backup created: $BackupName ($([math]::Round($BackupSize, 2)) MB)" -ForegroundColor Green

# Clean up old backups
Write-Host "==> Cleaning up backups older than $RetentionDays days..." -ForegroundColor Cyan
$CutoffDate = (Get-Date).AddDays(-$RetentionDays)
$OldBackups = Get-ChildItem -Path $DestDir -Filter "arkon-documents-*.tar.gz" |
    Where-Object { $_.LastWriteTime -lt $CutoffDate }

foreach ($OldBackup in $OldBackups) {
    Remove-Item $OldBackup.FullName -Force
    Write-Host "    Removed: $($OldBackup.Name)"
}

$BackupCount = (Get-ChildItem -Path $DestDir -Filter "arkon-documents-*.tar.gz").Count
Write-Host "==> Local backups remaining: $BackupCount" -ForegroundColor Cyan

# Verify backup integrity
Write-Host "==> Verifying backup integrity..." -ForegroundColor Cyan
try {
    docker run --rm `
        -v "${DockerDestDir}:/backup:ro" `
        alpine:3.19 `
        sh -c "tar tzf /backup/${BackupName} > /dev/null 2>&1"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "==> Backup verified successfully" -ForegroundColor Green
    } else {
        throw "Verification failed"
    }
} catch {
    Write-Host "!!! Backup verification failed!" -ForegroundColor Red
    exit 1
}

Write-Host "==> Backup complete!" -ForegroundColor Green
