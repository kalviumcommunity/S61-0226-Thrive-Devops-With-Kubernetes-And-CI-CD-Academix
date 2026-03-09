param(
    [string]$Namespace = "default",
    [int]$Checks = 5,
    [int]$IntervalSeconds = 10,
    [switch]$ValidateIngress
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

function Assert-RolloutHealthy {
    param([string]$DeploymentName)

    kubectl rollout status deployment/$DeploymentName -n $Namespace --timeout=120s | Out-Null
    $ready = kubectl get deployment $DeploymentName -n $Namespace -o jsonpath='{.status.readyReplicas}'
    $desired = kubectl get deployment $DeploymentName -n $Namespace -o jsonpath='{.status.replicas}'

    if ([string]::IsNullOrWhiteSpace($ready)) {
        $ready = "0"
    }
    if ([string]::IsNullOrWhiteSpace($desired)) {
        $desired = "0"
    }

    if ($ready -ne $desired) {
        throw "Deployment '$DeploymentName' is not fully ready ($ready/$desired)."
    }

    Write-Host "Deployment '$DeploymentName' healthy ($ready/$desired)." -ForegroundColor Green
}

function Assert-ServiceHasEndpoints {
    param([string]$ServiceName)

    $endpoints = kubectl get endpoints $ServiceName -n $Namespace -o jsonpath='{.subsets[*].addresses[*].ip}'
    if ([string]::IsNullOrWhiteSpace($endpoints)) {
        throw "Service '$ServiceName' has no ready endpoints."
    }

    Write-Host "Service '$ServiceName' endpoints: $endpoints" -ForegroundColor Green
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

Write-Step "Validating kubectl context"
$currentContext = kubectl config current-context
if ([string]::IsNullOrWhiteSpace($currentContext)) {
    throw "kubectl has no active context."
}
Write-Host "Current context: $currentContext" -ForegroundColor Yellow

Write-Step "Checking rollout health"
Assert-RolloutHealthy -DeploymentName "mongo"
Assert-RolloutHealthy -DeploymentName "backend"
Assert-RolloutHealthy -DeploymentName "frontend"

Write-Step "Checking pod readiness summary"
kubectl get pods -n $Namespace -o wide

Write-Step "Checking service endpoint wiring"
Assert-ServiceHasEndpoints -ServiceName "backend-service"
Assert-ServiceHasEndpoints -ServiceName "frontend-service"

$backendPortForward = $null

try {
    Write-Step "Starting temporary port-forwards for runtime checks"
    $backendPortForward = Start-Process -FilePath "kubectl" -ArgumentList @("port-forward", "-n", $Namespace, "svc/backend-service", "18080:8000") -PassThru -WindowStyle Hidden
    Wait-HttpReady -Url "http://127.0.0.1:18080/docs"

    Write-Step "Running stability checks ($Checks rounds, every $IntervalSeconds seconds)"
    for ($i = 1; $i -le $Checks; $i++) {
        $backendHealth = Invoke-HttpStatus -Url "http://127.0.0.1:18080/docs" -AllowedStatus @(200)
        $backendOpenApi = Invoke-HttpStatus -Url "http://127.0.0.1:18080/openapi.json" -AllowedStatus @(200)
        $frontendStatus = "n/a"

        if ($ValidateIngress) {
            $frontendStatus = Invoke-IngressStatus -IngressHost "app.academix.local" -Path "/favicon.ico" -AllowedStatus @(200)
        }

        Write-Host "Round ${i}/${Checks}: backend docs=$backendHealth, backend openapi=$backendOpenApi, frontend ingress favicon=$frontendStatus" -ForegroundColor Green

        if ($i -lt $Checks) {
            Start-Sleep -Seconds $IntervalSeconds
        }
    }

    if ($ValidateIngress) {
        Write-Step "Running ingress checks"
        $appIngress = Invoke-IngressStatus -IngressHost "app.academix.local" -Path "/favicon.ico" -AllowedStatus @(200)
        $apiIngress = Invoke-IngressStatus -IngressHost "api.academix.local" -Path "/openapi.json" -AllowedStatus @(200)
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
