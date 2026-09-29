param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Host "Install Node.js 22 LTS (22.12 or newer), then reopen this launcher." -ForegroundColor Red
    exit 1
}

node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (!((major === 22 && minor >= 12) || major > 22)) process.exit(1);"
if ($LASTEXITCODE -ne 0) {
    Write-Host "This project needs Node.js 22.12 or newer. Node.js 22 LTS is recommended." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing project dependencies..."
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Starting QVM Works Digital Twin at http://127.0.0.1:$Port/" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop. Run npm ci again after pulling dependency changes."
npm.cmd run dev -- --port $Port --open
exit $LASTEXITCODE
