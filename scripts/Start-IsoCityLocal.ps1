[CmdletBinding()]
param(
    [int]$Port = 3000,
    [switch]$Development,
    [switch]$NoBrowser,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Assert-Command([string]$Name, [string]$InstallHint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is niet gevonden. $InstallHint"
    }
}

function Test-HttpReady([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

Assert-Command 'node' 'Installeer Node.js 22 LTS en start dit script opnieuw.'
Assert-Command 'npm' 'Installeer Node.js 22 LTS en start dit script opnieuw.'

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
    Write-Warning "Node.js $nodeMajor gedetecteerd. IsoCity wordt getest met Node.js 22 of nieuwer."
}

if (-not $SkipInstall) {
    if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
        Write-Host 'Dependencies installeren...' -ForegroundColor Cyan
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci is mislukt.' }
    }
}

if ($Development) {
    Write-Host "IsoCity development server starten op http://127.0.0.1:$Port ..." -ForegroundColor Cyan
    $process = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '-p', $Port) -WorkingDirectory $repoRoot -PassThru -WindowStyle Minimized
}
else {
    if (-not (Test-Path (Join-Path $repoRoot '.next'))) {
        Write-Host 'Production build maken...' -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Production build is mislukt.' }
    }

    Write-Host "IsoCity production server starten op http://127.0.0.1:$Port ..." -ForegroundColor Cyan
    $process = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'start', '--', '-p', $Port) -WorkingDirectory $repoRoot -PassThru -WindowStyle Minimized
}

$url = "http://127.0.0.1:$Port"
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) {
        throw "IsoCity server is onverwacht gestopt met exitcode $($process.ExitCode)."
    }
    if (Test-HttpReady $url) { break }
    Start-Sleep -Milliseconds 400
}

if (-not (Test-HttpReady $url)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "IsoCity werd niet bereikbaar op $url."
}

Write-Host "IsoCity draait lokaal. PID: $($process.Id)" -ForegroundColor Green
Write-Host "URL: $url" -ForegroundColor Green
Write-Host 'De browserversie is een installeerbare PWA en werkt na caching ook offline.' -ForegroundColor DarkGray

if (-not $NoBrowser) {
    Start-Process $url
}

Write-Host "Stoppen: Stop-Process -Id $($process.Id)" -ForegroundColor DarkGray
