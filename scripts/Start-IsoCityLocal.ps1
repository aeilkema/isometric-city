[CmdletBinding()]
param(
    [int]$Port = 3000,
    [switch]$Development,
    [switch]$NoBrowser,
    [switch]$SkipInstall,
    [switch]$SkipBuild
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

function Stop-ExistingIsoCityServer([int]$PortNumber) {
    $connections = Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $ownerPid = $connection.OwningProcess
        if (-not $ownerPid) { continue }

        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
        $commandLine = if ($processInfo) { [string]$processInfo.CommandLine } else { '' }

        if ($commandLine -match 'next' -or $commandLine -match 'isometric-city' -or $commandLine -match 'npm') {
            Write-Host "Bestaande IsoCity/Next server op poort $PortNumber stoppen (PID $ownerPid)..." -ForegroundColor DarkGray
            Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 600
        }
        else {
            throw "Poort $PortNumber is al in gebruik door PID $ownerPid. Stop dit proces of kies een andere poort met -Port."
        }
    }
}

function Show-ServerLogs([string]$StdOutPath, [string]$StdErrPath) {
    if (Test-Path $StdOutPath) {
        Write-Host "`n--- IsoCity server output ---" -ForegroundColor Yellow
        Get-Content $StdOutPath -Tail 80 -ErrorAction SilentlyContinue
    }
    if (Test-Path $StdErrPath) {
        Write-Host "`n--- IsoCity server errors ---" -ForegroundColor Yellow
        Get-Content $StdErrPath -Tail 80 -ErrorAction SilentlyContinue
    }
}

Assert-Command 'node' 'Installeer Node.js 22 LTS en start dit script opnieuw.'
Assert-Command 'npm' 'Installeer Node.js 22 LTS en start dit script opnieuw.'
Assert-Command 'git' 'Installeer Git for Windows en start dit script opnieuw.'

$nodeCommand = Get-Command node -ErrorAction Stop
$nodeExe = $nodeCommand.Source
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
    Write-Warning "Node.js $nodeMajor gedetecteerd. IsoCity wordt getest met Node.js 22 of nieuwer."
}

$commit = (git rev-parse --short HEAD 2>$null).Trim()
Write-Host "IsoCity Git-versie: $commit" -ForegroundColor Green

Stop-ExistingIsoCityServer -PortNumber $Port

if (-not $SkipInstall) {
    if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
        Write-Host 'Dependencies installeren...' -ForegroundColor Cyan
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci is mislukt.' }
    }
}

$nextCli = Join-Path $repoRoot 'node_modules\next\dist\bin\next'
if (-not (Test-Path $nextCli)) {
    throw "Next.js CLI niet gevonden op $nextCli. Verwijder node_modules en voer npm ci uit."
}

if (-not $Development) {
    if (-not $SkipBuild) {
        $nextDir = Join-Path $repoRoot '.next'
        if (Test-Path $nextDir) {
            Write-Host 'Oude production build verwijderen...' -ForegroundColor DarkGray
            Remove-Item $nextDir -Recurse -Force
        }

        Write-Host 'Actuele IsoCity production build maken...' -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Production build is mislukt.' }
    }
    elseif (-not (Test-Path (Join-Path $repoRoot '.next'))) {
        throw '-SkipBuild is gebruikt, maar er bestaat nog geen .next production build.'
    }
}

$logDir = Join-Path $repoRoot '.isocity-local'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stdoutLog = Join-Path $logDir 'server.stdout.log'
$stderrLog = Join-Path $logDir 'server.stderr.log'
Remove-Item $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

$mode = if ($Development) { 'dev' } else { 'start' }
Write-Host "IsoCity $mode server starten op http://127.0.0.1:$Port ..." -ForegroundColor Cyan

# Start node.exe directly instead of npm.cmd. On some Windows installations the
# npm wrapper process can exit while its child Next process disappears with it.
# A direct Node process is stable and gives us a real PID plus persistent logs.
$arguments = @($nextCli, $mode, '-H', '127.0.0.1', '-p', "$Port")
$startParams = @{
    FilePath = $nodeExe
    ArgumentList = $arguments
    WorkingDirectory = $repoRoot
    RedirectStandardOutput = $stdoutLog
    RedirectStandardError = $stderrLog
    PassThru = $true
    WindowStyle = 'Hidden'
}
$process = Start-Process @startParams

$url = "http://127.0.0.1:$Port"
$deadline = (Get-Date).AddSeconds(60)
$ready = $false

while ((Get-Date) -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) {
        Show-ServerLogs -StdOutPath $stdoutLog -StdErrPath $stderrLog
        throw "IsoCity server is gestopt met exitcode $($process.ExitCode)."
    }

    if (Test-HttpReady $url) {
        $ready = $true
        break
    }

    Start-Sleep -Milliseconds 400
}

if (-not $ready) {
    Show-ServerLogs -StdOutPath $stdoutLog -StdErrPath $stderrLog
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "IsoCity werd niet bereikbaar op $url binnen 60 seconden."
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
    Show-ServerLogs -StdOutPath $stdoutLog -StdErrPath $stderrLog
    throw "De HTTP-check slaagde, maar er is geen LISTEN socket meer op poort $Port."
}

Write-Host ''
Write-Host 'ISOCITY LOCAL IS ACTIEF' -ForegroundColor Green
Write-Host "URL:         $url" -ForegroundColor Green
Write-Host "Git-versie: $commit" -ForegroundColor Green
Write-Host "Node PID:    $($process.Id)" -ForegroundColor Green
Write-Host "Listen PID:  $($listener.OwningProcess)" -ForegroundColor Green
Write-Host "Log output:  $stdoutLog" -ForegroundColor DarkGray
Write-Host "Log errors:  $stderrLog" -ForegroundColor DarkGray

if (-not $NoBrowser) {
    $launchUrl = "$url/?build=$commit&local=1"
    Start-Process $launchUrl
}

Write-Host ''
Write-Host "Controle: Get-NetTCPConnection -LocalPort $Port -State Listen" -ForegroundColor DarkGray
Write-Host "Stoppen:  Stop-Process -Id $($listener.OwningProcess)" -ForegroundColor DarkGray
