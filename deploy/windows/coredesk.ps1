param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Build', 'Backend', 'Frontend')]
    [string]$Action,
    [switch]$AllowRegistration,
    [ValidateRange(1024, 65535)]
    [int]$BackendPort = 8000,
    [ValidateRange(1024, 65535)]
    [int]$FrontendPort = 3000,
    [ValidateSet('.next-tunnel', '.next-tunnel-smoke')]
    [string]$BuildDirectory = '.next-tunnel'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$savedEnvironment = @{}

function Set-ProcessSetting([string]$Name, [string]$Value) {
    $savedEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

Push-Location $projectRoot
try {
    if ($Action -eq 'Backend') {
        Set-Location (Join-Path $projectRoot 'backend')
        $python = Join-Path $projectRoot 'backend/.venv/Scripts/python.exe'
        if (-not (Test-Path -LiteralPath $python)) {
            throw 'Run: python -m venv backend/.venv; then backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt'
        }
        # Keep DATABASE_URL and SECRET_KEY from the existing backend/.env.
        # Only this process and its child receive the public deployment settings.
        Set-ProcessSetting 'COOKIE_SECURE' 'true'
        Set-ProcessSetting 'FRONTEND_ORIGIN' 'https://coredesk.shinobuabe.com'
        Set-ProcessSetting 'ALLOW_REGISTRATION' ($AllowRegistration.IsPresent.ToString().ToLowerInvariant())
        & $python -m uvicorn app.main:app --host 127.0.0.1 --port $BackendPort --proxy-headers --forwarded-allow-ips 127.0.0.1
    } else {
        Set-Location (Join-Path $projectRoot 'frontend')
        # The build-time rewrite destination and server-side fetch must agree.
        Set-ProcessSetting 'BACKEND_URL' "http://127.0.0.1:$BackendPort"
        Set-ProcessSetting 'PUBLIC_ORIGIN' 'https://coredesk.shinobuabe.com'
        Set-ProcessSetting 'COREDESK_DIST_DIR' $BuildDirectory
        if ($Action -eq 'Build') {
            & npm.cmd run build
        } else {
            if (-not (Test-Path -LiteralPath (Join-Path $BuildDirectory 'BUILD_ID'))) {
                throw 'Build the frontend first: deploy/windows/coredesk.cmd Build'
            }
            & npm.cmd run start -- --hostname 127.0.0.1 --port $FrontendPort
        }
    }
    if ($LASTEXITCODE -ne 0) { throw "CoreDesk $Action failed (exit $LASTEXITCODE)." }
} finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    Pop-Location
}
