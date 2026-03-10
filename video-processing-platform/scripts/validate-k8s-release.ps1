param(
    [string]$Namespace = "default",
    [int]$Checks = 5,
    [int]$IntervalSeconds = 10,
    [switch]$ValidateIngress,
    [string]$ReleaseName,
    [string]$ChartName = "video-processing-platform"
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "\n==> $Message" -ForegroundColor Cyan
}

function Assert-CommandExists {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Invoke-Kubectl {
    param(
        [string[]]$Arguments,
        [switch]$IgnoreExitCode
    )

    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        $output = & kubectl @Arguments
    }
    finally {
        $ErrorActionPreference = $previousErrorPreference
    }

    if (-not $IgnoreExitCode -and $LASTEXITCODE -ne 0) {
        throw "kubectl $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }

    return $output
}

function Assert-ClusterReachable {
    Invoke-Kubectl -Arguments @("cluster-info") | Out-Null
}

function Test-ResourceExists {
    param(
        [string]$Kind,
        [string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($Name)) {
        return $false
    }

    $resource = (Invoke-Kubectl -Arguments @("get", $Kind, $Name, "-n", $Namespace, "-o", "name", "--ignore-not-found") | Out-String).Trim()
    return -not [string]::IsNullOrWhiteSpace($resource)
}

function Resolve-ResourceName {
    param(
        [string]$Kind,
        [string[]]$Candidates
    )

    foreach ($candidate in $Candidates) {
        if (Test-ResourceExists -Kind $Kind -Name $candidate) {
            return $candidate
        }
    }

    throw "Unable to resolve $Kind from candidates: $($Candidates -join ', ')"
}

function Get-NameCandidates {
    param(
        [string]$Suffix,
        [switch]$IncludePlainSuffix
    )

    $candidates = @()

    if (-not [string]::IsNullOrWhiteSpace($ReleaseName)) {
        $candidates += "$ReleaseName-$ChartName-$Suffix"
        $candidates += "$ReleaseName-$Suffix"
        if ($Suffix -eq "ingress") {
            $candidates += "$ReleaseName"
        }
    }

    if ($IncludePlainSuffix) {
        $candidates += $Suffix
    }

    return $candidates | Select-Object -Unique
}

function Assert-RolloutHealthy {
    param([string]$DeploymentName)

    Invoke-Kubectl -Arguments @("rollout", "status", "deployment/$DeploymentName", "-n", $Namespace, "--timeout=120s") | Out-Null
    $ready = (Invoke-Kubectl -Arguments @("get", "deployment", $DeploymentName, "-n", $Namespace, "-o", "jsonpath={.status.readyReplicas}") | Out-String).Trim()
    $desired = (Invoke-Kubectl -Arguments @("get", "deployment", $DeploymentName, "-n", $Namespace, "-o", "jsonpath={.status.replicas}") | Out-String).Trim()

    if ([string]::IsNullOrWhiteSpace($ready)) {
        $ready = "0"
    }
    if ([string]::IsNullOrWhiteSpace($desired)) {
        $desired = "0"
    }

    [int]$readyInt = [int]$ready
    [int]$desiredInt = [int]$desired

    if ($desiredInt -le 0) {
        throw "Deployment '$DeploymentName' has no desired replicas ($ready/$desired)."
    }

    if ($readyInt -ne $desiredInt) {
        throw "Deployment '$DeploymentName' is not fully ready ($ready/$desired)."
    }

    Write-Host "Deployment '$DeploymentName' healthy ($ready/$desired)." -ForegroundColor Green
}

function Assert-ServiceHasEndpoints {
    param([string]$ServiceName)

    $endpoints = (Invoke-Kubectl -Arguments @("get", "endpoints", $ServiceName, "-n", $Namespace, "-o", "jsonpath={.subsets[*].addresses[*].ip}") | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($endpoints)) {
        throw "Service '$ServiceName' has no ready endpoints."
    }

    Write-Host "Service '$ServiceName' endpoints: $endpoints" -ForegroundColor Green
}

function Get-IngressHosts {
    param([string]$IngressName)

    $hostsRaw = (Invoke-Kubectl -Arguments @("get", "ingress", $IngressName, "-n", $Namespace, "-o", "jsonpath={.spec.rules[*].host}") | Out-String).Trim()
    return ($hostsRaw -split "\s+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Invoke-HttpStatus {
    param(
        [string]$Url,
        [int[]]$AllowedStatus
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 6 -UseBasicParsing
        $statusCode = [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        } else {
            throw "HTTP request failed for '$Url': $($_.Exception.Message)"
        }
    }

    if ($AllowedStatus -notcontains $statusCode) {
        throw "Unexpected status from '$Url'. Expected one of [$($AllowedStatus -join ', ')], got $statusCode."
    }

    return $statusCode
}

function Invoke-IngressStatus {
    param(
        [string]$IngressHost,
        [string]$Path,
        [int[]]$AllowedStatus
    )

    $dnsUrl = "http://$IngressHost$Path"
    try {
        return Invoke-HttpStatus -Url $dnsUrl -AllowedStatus $AllowedStatus
    } catch {
        # Fallback for local machines where hosts file is not mapped.
        $fallbackUrl = "http://127.0.0.1$Path"
        try {
            $response = Invoke-WebRequest -Uri $fallbackUrl -Headers @{ Host = $IngressHost } -TimeoutSec 6 -UseBasicParsing
            $statusCode = [int]$response.StatusCode
        } catch {
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            } else {
                throw "Ingress request failed for host '$IngressHost' path '$Path' (DNS and localhost fallback). Last error: $($_.Exception.Message)"
            }
        }

        if ($AllowedStatus -notcontains $statusCode) {
            throw "Unexpected ingress status for host '$IngressHost' path '$Path'. Expected one of [$($AllowedStatus -join ', ')], got $statusCode."
        }

        return $statusCode
    }
}

function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$Attempts = 20,
        [int]$DelaySeconds = 1
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $null = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
            return
        } catch {
            if ($attempt -eq $Attempts) {
                throw "Endpoint '$Url' did not become reachable after $Attempts attempts."
            }
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

Assert-CommandExists -Name "kubectl"
Assert-ClusterReachable

Write-Step "Validating kubectl context"
$currentContext = (Invoke-Kubectl -Arguments @("config", "current-context") | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($currentContext)) {
    throw "kubectl has no active context."
}
Write-Host "Current context: $currentContext" -ForegroundColor Yellow

Write-Step "Resolving deployment and service names"
$mongoDeployment = Resolve-ResourceName -Kind "deployment" -Candidates (Get-NameCandidates -Suffix "mongo" -IncludePlainSuffix)
$backendDeployment = Resolve-ResourceName -Kind "deployment" -Candidates (Get-NameCandidates -Suffix "backend" -IncludePlainSuffix)
$frontendDeployment = Resolve-ResourceName -Kind "deployment" -Candidates (Get-NameCandidates -Suffix "frontend" -IncludePlainSuffix)

$backendService = Resolve-ResourceName -Kind "service" -Candidates (Get-NameCandidates -Suffix "backend-service" -IncludePlainSuffix)
$frontendService = Resolve-ResourceName -Kind "service" -Candidates (Get-NameCandidates -Suffix "frontend-service" -IncludePlainSuffix)

Write-Host "Deployments: mongo=$mongoDeployment, backend=$backendDeployment, frontend=$frontendDeployment" -ForegroundColor Yellow
Write-Host "Services: backend=$backendService, frontend=$frontendService" -ForegroundColor Yellow

Write-Step "Checking rollout health"
Assert-RolloutHealthy -DeploymentName $mongoDeployment
Assert-RolloutHealthy -DeploymentName $backendDeployment
Assert-RolloutHealthy -DeploymentName $frontendDeployment

Write-Step "Checking pod readiness summary"
Invoke-Kubectl -Arguments @("get", "pods", "-n", $Namespace, "-o", "wide")

Write-Step "Checking service endpoint wiring"
Assert-ServiceHasEndpoints -ServiceName $backendService
Assert-ServiceHasEndpoints -ServiceName $frontendService

$backendPortForward = $null
$appIngressHost = $null
$apiIngressHost = $null

if ($ValidateIngress) {
    $ingressName = Resolve-ResourceName -Kind "ingress" -Candidates (Get-NameCandidates -Suffix "ingress" -IncludePlainSuffix)
    $hosts = Get-IngressHosts -IngressName $ingressName
    if ($hosts.Count -eq 0) {
        throw "Ingress '$ingressName' has no rules/hosts."
    }

    $appIngressHost = $hosts | Where-Object { $_ -like "app*" } | Select-Object -First 1
    $apiIngressHost = $hosts | Where-Object { $_ -like "api*" } | Select-Object -First 1

    if ([string]::IsNullOrWhiteSpace($appIngressHost)) {
        $appIngressHost = $hosts[0]
    }
    if ([string]::IsNullOrWhiteSpace($apiIngressHost)) {
        $apiIngressHost = $hosts[0]
    }

    Write-Host "Ingress resolved: name=$ingressName appHost=$appIngressHost apiHost=$apiIngressHost" -ForegroundColor Yellow
}

try {
    Write-Step "Starting temporary port-forwards for runtime checks"
    $backendPortForward = Start-Process -FilePath "kubectl" -ArgumentList @("port-forward", "-n", $Namespace, "svc/$backendService", "18080:8000") -PassThru -WindowStyle Hidden
    Wait-HttpReady -Url "http://127.0.0.1:18080/docs"

    Write-Step "Running stability checks ($Checks rounds, every $IntervalSeconds seconds)"
    for ($i = 1; $i -le $Checks; $i++) {
        $backendHealth = Invoke-HttpStatus -Url "http://127.0.0.1:18080/docs" -AllowedStatus @(200)
        $backendOpenApi = Invoke-HttpStatus -Url "http://127.0.0.1:18080/openapi.json" -AllowedStatus @(200)
        $frontendStatus = "n/a"

        if ($ValidateIngress) {
            $frontendStatus = Invoke-IngressStatus -IngressHost $appIngressHost -Path "/favicon.ico" -AllowedStatus @(200)
        }

        Write-Host "Round ${i}/${Checks}: backend docs=$backendHealth, backend openapi=$backendOpenApi, frontend ingress favicon=$frontendStatus" -ForegroundColor Green

        if ($i -lt $Checks) {
            Start-Sleep -Seconds $IntervalSeconds
        }
    }

    if ($ValidateIngress) {
        Write-Step "Running ingress checks"
        $appIngress = Invoke-IngressStatus -IngressHost $appIngressHost -Path "/favicon.ico" -AllowedStatus @(200)
        $apiIngress = Invoke-IngressStatus -IngressHost $apiIngressHost -Path "/openapi.json" -AllowedStatus @(200)
        Write-Host "Ingress status: app=$appIngress, api=$apiIngress" -ForegroundColor Green
    }
}
finally {
    Write-Step "Cleaning up temporary port-forwards"
    if ($backendPortForward -and -not $backendPortForward.HasExited) {
        Stop-Process -Id $backendPortForward.Id -Force
    }
}

Write-Step "Release validation passed"
Write-Host "All health, reachability, and repeated stability checks succeeded." -ForegroundColor Green
Write-Host "Use this output as evidence in your PR and video demo." -ForegroundColor Yellow
