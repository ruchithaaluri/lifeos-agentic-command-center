# LifeOS System Verification Script
# Checks that all components are properly configured and running

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "LifeOS System Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

# Function to check if a command exists
function Test-Command {
    param($Command)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try {
        if (Get-Command $Command) { return $true }
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $oldPreference
    }
}

# Function to print result
function Print-Result {
    param($Name, $Passed, $Details = "")
    if ($Passed) {
        Write-Host "✓ $Name" -ForegroundColor Green
        if ($Details) {
            Write-Host "  $Details" -ForegroundColor Gray
        }
    } else {
        Write-Host "✗ $Name" -ForegroundColor Red
        if ($Details) {
            Write-Host "  $Details" -ForegroundColor Yellow
        }
        $script:allPassed = $false
    }
}

Write-Host "Checking Prerequisites..." -ForegroundColor Yellow
Write-Host ""

# Check Node.js
$nodeVersion = $null
if (Test-Command "node") {
    $nodeVersion = node --version
    $nodeOk = $nodeVersion -match "v(\d+)\.(\d+)\.(\d+)" -and [int]$matches[1] -ge 18
    Print-Result "Node.js $nodeVersion" $nodeOk "Requires v18 or higher"
} else {
    Print-Result "Node.js" $false "Not installed"
}

# Check pnpm
$pnpmVersion = $null
if (Test-Command "pnpm") {
    $pnpmVersion = pnpm --version
    Print-Result "pnpm $pnpmVersion" $true
} else {
    Print-Result "pnpm" $false "Not installed - run: npm install -g pnpm"
}

# Check Docker
$dockerRunning = $false
if (Test-Command "docker") {
    try {
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            $dockerRunning = $true
            Print-Result "Docker" $true "Running"
        } else {
            Print-Result "Docker" $false "Not running - start Docker Desktop"
        }
    } catch {
        Print-Result "Docker" $false "Not running"
    }
} else {
    Print-Result "Docker" $false "Not installed"
}

Write-Host ""
Write-Host "Checking Project Files..." -ForegroundColor Yellow
Write-Host ""

# Check key directories
$checkDirs = @(
    "packages/shared",
    "packages/database",
    "packages/ai",
    "packages/ui",
    "apps/mcp-server",
    "apps/web",
    "docs"
)

foreach ($dir in $checkDirs) {
    $exists = Test-Path $dir
    Print-Result "$dir/" $exists
}

Write-Host ""
Write-Host "Checking Configuration Files..." -ForegroundColor Yellow
Write-Host ""

# Check configuration files
$checkFiles = @(
    ".env.local",
    "pnpm-workspace.yaml",
    "docker-compose.yml",
    "packages/database/prisma/schema.prisma"
)

foreach ($file in $checkFiles) {
    $exists = Test-Path $file
    Print-Result $file $exists
}

Write-Host ""
Write-Host "Checking Dependencies..." -ForegroundColor Yellow
Write-Host ""

# Check if node_modules exists
$nodeModulesExists = Test-Path "node_modules"
Print-Result "Dependencies installed" $nodeModulesExists "Run: pnpm install"

Write-Host ""
Write-Host "Checking Database..." -ForegroundColor Yellow
Write-Host ""

# Check if PostgreSQL container is running
if ($dockerRunning) {
    try {
        $containerStatus = docker compose ps --format json | ConvertFrom-Json
        $dbRunning = $containerStatus | Where-Object { $_.Service -eq "db" -and $_.State -eq "running" }
        if ($dbRunning) {
            Print-Result "PostgreSQL Container" $true "Running on port 5432"
        } else {
            Print-Result "PostgreSQL Container" $false "Not running - run: docker compose up -d"
        }
    } catch {
        Print-Result "PostgreSQL Container" $false "Could not check status"
    }
}

# Check if migrations have been run
$migrationsDir = "packages/database/prisma/migrations"
$migrationsExist = Test-Path $migrationsDir
if ($migrationsExist) {
    $migrationCount = (Get-ChildItem $migrationsDir -Directory | Measure-Object).Count
    $migrated = $migrationCount -gt 0
    Print-Result "Database Migrations" $migrated "$migrationCount migration(s) found"
} else {
    Print-Result "Database Migrations" $false "No migrations directory"
}

Write-Host ""
Write-Host "Checking Services..." -ForegroundColor Yellow
Write-Host ""

# Check MCP Server
try {
    $mcpResponse = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 2 -ErrorAction Stop
    if ($mcpResponse.StatusCode -eq 200) {
        $mcpData = $mcpResponse.Content | ConvertFrom-Json
        $toolCount = $mcpData.toolsRegistered
        Print-Result "MCP Server" $true "Running on port 3001 with $toolCount tools"
    } else {
        Print-Result "MCP Server" $false "Unhealthy response"
    }
} catch {
    Print-Result "MCP Server" $false "Not responding on port 3001"
}

# Check Web App
try {
    $webResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction Stop
    if ($webResponse.StatusCode -eq 200) {
        Print-Result "Web App" $true "Running on port 3000"
    } else {
        Print-Result "Web App" $false "Unhealthy response"
    }
} catch {
    Print-Result "Web App" $false "Not responding on port 3000"
}

Write-Host ""
Write-Host "Checking Documentation..." -ForegroundColor Yellow
Write-Host ""

$docs = @(
    "README.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "docs/HACKATHON_COMPLIANCE.md",
    "docs/PROJECT_SUMMARY.md"
)

foreach ($doc in $docs) {
    $exists = Test-Path $doc
    Print-Result $doc $exists
}

Write-Host ""
Write-Host "Checking Tests..." -ForegroundColor Yellow
Write-Host ""

$testDirs = @(
    "packages/shared/__tests__",
    "packages/ai/__tests__",
    "apps/mcp-server/__tests__",
    "apps/web/e2e"
)

foreach ($testDir in $testDirs) {
    $exists = Test-Path $testDir
    Print-Result "$testDir/" $exists
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($allPassed) {
    Write-Host "✓ All checks passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "System is ready! Access the application:" -ForegroundColor Green
    Write-Host "  - Landing:  http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  - Dashboard: http://localhost:3000/dashboard" -ForegroundColor Cyan
    Write-Host "  - Alexa:    http://localhost:3000/alexa" -ForegroundColor Cyan
} else {
    Write-Host "✗ Some checks failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please address the issues above." -ForegroundColor Yellow
    Write-Host "See README.md for setup instructions." -ForegroundColor Yellow
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
