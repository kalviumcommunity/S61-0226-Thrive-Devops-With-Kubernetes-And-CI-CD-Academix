param(
    [string]$BaseUrl = "http://localhost",
    [string]$ApiHost = "api.dev.academix.local",
    [int]$TimeoutSeconds = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$passed = 0
$failed = 0

function Invoke-Endpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int]$ExpectedStatus,
        [Parameter(Mandatory = $true)][string]$Description,
        [scriptblock]$Validate
    )

    $url = "$BaseUrl$Path"
    try {
        $response = Invoke-WebRequest -Uri $url -Headers @{ Host = $ApiHost } -Method Get -TimeoutSec $TimeoutSeconds
        if ($response.StatusCode -ne $ExpectedStatus) {
            throw "Expected HTTP $ExpectedStatus but got $($response.StatusCode)"
        }

        if ($null -ne $Validate) {
            & $Validate $response
        }

        Write-Host "PASS [$($response.StatusCode)] $Description ($Path)"
        $script:passed++
    }
    catch {
        Write-Host "FAIL $Description ($Path): $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host "Running smoke tests against $BaseUrl with Host header '$ApiHost'"

Invoke-Endpoint -Path "/health" -ExpectedStatus 200 -Description "Service liveness and readiness summary" -Validate {
    param($response)
    $payload = $response.Content | ConvertFrom-Json
    if ($payload.status -ne "healthy") { throw "Expected status='healthy'" }
    if ($payload.service -ne "video-api") { throw "Expected service='video-api'" }
    if ($payload.liveness -ne "ok") { throw "Expected liveness='ok'" }
    if ($payload.readiness -ne "ready") { throw "Expected readiness='ready'" }
}

Invoke-Endpoint -Path "/health/readiness" -ExpectedStatus 200 -Description "Readiness probe" -Validate {
    param($response)
    $payload = $response.Content | ConvertFrom-Json
    if ($payload.status -ne "ready") { throw "Expected status='ready'" }
}

Invoke-Endpoint -Path "/api/lectures" -ExpectedStatus 200 -Description "Primary lectures API" -Validate {
    param($response)
    $payload = $response.Content | ConvertFrom-Json
    if (-not ($payload -is [System.Array])) { throw "Expected a JSON array" }
    if ($payload.Count -lt 1) { throw "Expected at least one lecture" }
    if (-not $payload[0].slug) { throw "Expected first lecture to include 'slug'" }
    if (-not $payload[0].title) { throw "Expected first lecture to include 'title'" }
}

Invoke-Endpoint -Path "/observability/metrics-snapshot" -ExpectedStatus 200 -Description "Observability snapshot" -Validate {
    param($response)
    $payload = $response.Content | ConvertFrom-Json
    if ($payload.service -ne "video-api") { throw "Expected service='video-api'" }
    if ($null -eq $payload.requestsTotal) { throw "Expected requestsTotal field" }
    if ($payload.errorRatePercent -lt 0) { throw "Expected non-negative error rate" }
}

Invoke-Endpoint -Path "/metrics" -ExpectedStatus 200 -Description "Prometheus metrics endpoint" -Validate {
    param($response)
    if (-not $response.Content.Contains("video_api_http_requests_total")) {
        throw "Expected Prometheus metric 'video_api_http_requests_total'"
    }
}

Write-Host ""
Write-Host "Smoke test summary: Passed=$passed Failed=$failed"

if ($failed -gt 0) {
    exit 1
}

exit 0
