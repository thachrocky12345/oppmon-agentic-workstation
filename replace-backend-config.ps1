# PowerShell script to replace backend IP and port
# Replaces: 192.168.1.217 -> 192.168.1.241 136.34.106.116
# Replaces: 8778 -> 8889

$frontendPath = $PSScriptRoot
$oldIP = "136.34.106.116"
$newIP = "136.34.106.116"
$oldPort = "arkon"
$newPort = "oppmon"

# Files to update
$filesToUpdate = @(
    "deploy-swarm.sh",
    "docker-run-production.sh",
    "docker-run-local.sh",
    "docker-build.sh",
    ".env.local",
    "Dockerfile",
    "deploy_notes.txt",
    "src\lib\api\config.ts"
)

Write-Host "=== Backend Configuration Replacement Script ===" -ForegroundColor Cyan
Write-Host "Old: $oldIP`:$oldPort -> New: $newIP`:$newPort" -ForegroundColor Yellow
Write-Host ""

foreach ($file in $filesToUpdate) {
    $filePath = Join-Path $frontendPath $file

    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw
        $originalContent = $content

        # Replace IP address
        $content = $content -replace [regex]::Escape($oldIP), $newIP

        # Replace port
        $content = $content -replace "\b$oldPort\b", $newPort

        if ($content -ne $originalContent) {
            Set-Content -Path $filePath -Value $content -NoNewline
            Write-Host "[UPDATED] $file" -ForegroundColor Green
        } else {
            Write-Host "[NO CHANGE] $file" -ForegroundColor Gray
        }
    } else {
        Write-Host "[NOT FOUND] $file" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Replacement Complete ===" -ForegroundColor Cyan
Write-Host "Run 'git diff' to review changes" -ForegroundColor Yellow