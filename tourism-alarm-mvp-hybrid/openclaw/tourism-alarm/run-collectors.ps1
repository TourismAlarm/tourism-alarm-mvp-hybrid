# Tourism Alarm - recoleccion de datos
#
# Lanza los recolectores y deja las senales en la cola de revision.
# Pensado para que lo llame el cron de OpenClaw.
#
#   powershell -File run-collectors.ps1
#   powershell -File run-collectors.ps1 -DryRun
#   powershell -File run-collectors.ps1 -Only agenda-cat

param(
    [switch]$DryRun,
    [string]$Only,
    [switch]$Publish
)

$ErrorActionPreference = 'Stop'

# La raiz del proyecto es dos niveles por encima de este script.
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $ProjectRoot

Write-Host "Tourism Alarm - $ProjectRoot" -ForegroundColor Cyan

if (-not (Test-Path '.env')) {
    Write-Host "ERROR: falta .env con las credenciales de Supabase." -ForegroundColor Red
    Write-Host "       Copia .env.example a .env y rellena SUPABASE_SERVICE_KEY."
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: no se encuentra Node.js en el PATH." -ForegroundColor Red
    exit 1
}

$arguments = @('scripts/collect/run-all.js')
if ($DryRun) { $arguments += '--dry-run' }
if ($Only)   { $arguments += "--only=$Only" }

& node $arguments
$collectExit = $LASTEXITCODE

if ($collectExit -ne 0) {
    Write-Host "Algun recolector fallo. El detalle esta en agent_runs." -ForegroundColor Yellow
    exit $collectExit
}

# Publicar es un paso aparte y deliberado: solo sale al mapa lo aprobado.
if ($Publish) {
    Write-Host "`nPublicando senales aprobadas..." -ForegroundColor Cyan
    & node 'scripts/publish-snapshot.js'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "`nListo." -ForegroundColor Green
exit 0
