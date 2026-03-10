param(
    [ValidateSet("dev", "prod")]
    [string]$Environment = "dev",
    [string]$ReleaseName = "video-platform",
    [string]$Namespace = "default",
    [ValidateSet("backend", "frontend")]
    [string]$Target = "backend",
    [string]$BadImageTag = "rollback-drill-bad",
    [int]$FailTimeoutSeconds = 90,
    [int]$RecoverTimeoutSeconds = 180,
    [switch]$ValidateIngress
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
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

function Resolve-ChartFullnamePrefix {
    param(
        [string]$Release,
        [string]$Chart = "video-processing-platform"
    )

    # Mirrors templates/_helpers.tpl fullname logic used by Helm chart.
    if ($Release -like "*$Chart*") {
        return $Release
    }

    return "$Release-$Chart"
}

function Assert-RolloutHealthy {
    param(
        [string]$Deployment,
        [int]$TimeoutSeconds
    )

    Invoke-Kubectl -Arguments @("rollout", "status", "deployment/$Deployment", "-n", $Namespace, "--timeout=${TimeoutSeconds}s") | Out-Null

    $ready = (Invoke-Kubectl -Arguments @("get", "deployment", $Deployment, "-n", $Namespace, "-o", "jsonpath={.status.readyReplicas}") | Out-String).Trim()
    $desired = (Invoke-Kubectl -Arguments @("get", "deployment", $Deployment, "-n", $Namespace, "-o", "jsonpath={.status.replicas}") | Out-String).Trim()

    if ([string]::IsNullOrWhiteSpace($ready)) { $ready = "0" }
    if ([string]::IsNullOrWhiteSpace($desired)) { $desired = "0" }

    [int]$readyInt = [int]$ready
    [int]$desiredInt = [int]$desired

    if ($desiredInt -le 0) {
        throw "Deployment '$Deployment' has no desired replicas ($ready/$desired)."
    }

    if ($readyInt -ne $desiredInt) {
        throw "Deployment '$Deployment' is not fully healthy ($ready/$desired)."
    }

    Write-Host "Deployment '$Deployment' healthy ($ready/$desired)." -ForegroundColor Green
}

function Assert-ServiceHasEndpoints {
    param([string]$ServiceName)

    $endpoints = (Invoke-Kubectl -Arguments @("get", "endpoints", $ServiceName, "-n", $Namespace, "-o", "jsonpath={.subsets[*].addresses[*].ip}") | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($endpoints)) {
        throw "Service '$ServiceName' has no ready endpoints."
    }

    Write-Host "Service '$ServiceName' endpoints: $endpoints" -ForegroundColor Green
}

function Get-CurrentContainerImage {
    param(
        [string]$Deployment,
        [string]$Container
    )

    $image = (Invoke-Kubectl -Arguments @("get", "deployment", $Deployment, "-n", $Namespace, "-o", "jsonpath={.spec.template.spec.containers[?(@.name=='$Container')].image}") | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($image)) {
        throw "Unable to read current image for container '$Container' in deployment '$Deployment'."
    }

    return $image
}

function Get-ImageRepository {
    param([string]$Image)

    if ($Image.Contains("@")) {
        return $Image.Split("@")[0]
    }

    $lastSlash = $Image.LastIndexOf("/")
    $lastColon = $Image.LastIndexOf(":")

    if ($lastColon -gt $lastSlash) {
        return $Image.Substring(0, $lastColon)
    }

    return $Image
}

function Show-FailureEvidence {
    param(
        [string]$Deployment,
        [string]$AppLabel
    )

    Write-Step "Failure evidence: rollout and pods"
    Invoke-Kubectl -Arguments @("rollout", "history", "deployment/$Deployment", "-n", $Namespace)
    Invoke-Kubectl -Arguments @("get", "pods", "-n", $Namespace, "-l", "app=$AppLabel", "-o", "wide")

    $failingPod = (Invoke-Kubectl -Arguments @("get", "pods", "-n", $Namespace, "-l", "app=$AppLabel", "--sort-by=.metadata.creationTimestamp", "-o", "jsonpath={.items[-1].metadata.name}") | Out-String).Trim()
    if (-not [string]::IsNullOrWhiteSpace($failingPod)) {
        Write-Step "Failure evidence: describe pod '$failingPod'"
        Invoke-Kubectl -Arguments @("describe", "pod", $failingPod, "-n", $Namespace)
    }
}

Assert-CommandExists -Name "kubectl"
Assert-ClusterReachable

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$validateScript = Join-Path $scriptDir "validate-k8s-release.ps1"
if (-not (Test-Path $validateScript)) {
    throw "Validation script not found: $validateScript"
}

$fullnamePrefix = Resolve-ChartFullnamePrefix -Release $ReleaseName
$targetDeployment = "$fullnamePrefix-$Target"
$targetContainer = $Target
$targetService = "$fullnamePrefix-$Target-service"
$targetLabel = "video-processing-platform-$Target"

Write-Step "Drill configuration"
Write-Host "Environment: $Environment"
Write-Host "Namespace: $Namespace"
Write-Host "Release: $ReleaseName"
Write-Host "Target deployment: $targetDeployment"
Write-Host "Bad image tag: $BadImageTag"

Write-Step "Baseline validation before failure simulation"
Assert-RolloutHealthy -Deployment $targetDeployment -TimeoutSeconds $RecoverTimeoutSeconds
Assert-ServiceHasEndpoints -ServiceName $targetService

$baselineImage = Get-CurrentContainerImage -Deployment $targetDeployment -Container $targetContainer
$imageRepo = Get-ImageRepository -Image $baselineImage
$badImage = "${imageRepo}:$BadImageTag"

Write-Host "Current image: $baselineImage" -ForegroundColor Yellow
Write-Host "Simulated bad image: $badImage" -ForegroundColor Yellow

Write-Step "Recording rollout history before fault injection"
Invoke-Kubectl -Arguments @("rollout", "history", "deployment/$targetDeployment", "-n", $Namespace)

Write-Step "Injecting failure by setting non-existent image tag"
Invoke-Kubectl -Arguments @("set", "image", "deployment/$targetDeployment", "$targetContainer=$badImage", "-n", $Namespace) | Out-Null

$failedAsExpected = $false
try {
    Invoke-Kubectl -Arguments @("rollout", "status", "deployment/$targetDeployment", "-n", $Namespace, "--timeout=${FailTimeoutSeconds}s") | Out-Null
}
catch {
    $failedAsExpected = $true
    Write-Host "Rollout failed as expected within timeout window." -ForegroundColor Yellow
}

if (-not $failedAsExpected) {
    throw "Failure simulation did not fail within ${FailTimeoutSeconds}s. Aborting to avoid unsafe state assumptions."
}

Show-FailureEvidence -Deployment $targetDeployment -AppLabel $targetLabel

Write-Step "Rolling back to previous known-good revision"
Invoke-Kubectl -Arguments @("rollout", "undo", "deployment/$targetDeployment", "-n", $Namespace) | Out-Null
Assert-RolloutHealthy -Deployment $targetDeployment -TimeoutSeconds $RecoverTimeoutSeconds
Assert-ServiceHasEndpoints -ServiceName $targetService

Write-Step "Post-rollback full release validation"
$params = @{
    Namespace = $Namespace
    Checks = 3
    IntervalSeconds = 10
    ReleaseName = $ReleaseName
}
if ($ValidateIngress) {
    $params.ValidateIngress = $true
}

& $validateScript @params
if ($LASTEXITCODE -ne 0) {
    throw "Post-rollback release validation failed."
}

Write-Step "Rollback drill completed successfully"
Write-Host "Fault was introduced, detected, rolled back, and recovery validated." -ForegroundColor Green
Write-Host "Capture this terminal output for Sprint #3 PR evidence and video narration." -ForegroundColor Yellow
