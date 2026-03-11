param(
    [string]$BaseUrl = "http://localhost:8000",
    [double]$Timestamp = 8
)

$ErrorActionPreference = "Stop"

function Invoke-JsonGet {
    param(
        [Parameter(Mandatory = $true)][string]$Url
    )

    $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url
    return ($resp.Content | ConvertFrom-Json)
}

try {
    $health = Invoke-JsonGet -Url "$BaseUrl/health"
    if ($health.status -ne "healthy") {
        throw "Health endpoint returned non-healthy status: $($health.status)"
    }

    $lectures = Invoke-JsonGet -Url "$BaseUrl/api/lectures"
    if (-not $lectures -or $lectures.Count -eq 0) {
        throw "No lectures found. Upload or seed at least one lecture first."
    }

    $slug = $lectures[0].slug
    $summaryResp = Invoke-JsonGet -Url "$BaseUrl/api/lectures/$slug/live-summary?timestamp=$Timestamp"
    $summaryText = [string]$summaryResp.summary

    Write-Host "AI Notes verification report"
    Write-Host "- BaseUrl: $BaseUrl"
    Write-Host "- Lecture slug: $slug"
    Write-Host "- Timestamp: $Timestamp"
    Write-Host "- Live summary: $summaryText"

    if ([string]::IsNullOrWhiteSpace($summaryText)) {
        Write-Host "Result: FAIL (empty summary)" -ForegroundColor Red
        exit 1
    }

    if ($summaryText -like "*disabled*" -or $summaryText -like "*unavailable*") {
        Write-Host "Result: FAIL (AI notes fallback detected)." -ForegroundColor Red
        Write-Host "Check backend/.env values for GOOGLE_API_KEY, ENABLE_AI_SUMMARY, and ENABLE_LIVE_SUMMARY, then restart backend."
        exit 2
    }

    Write-Host "Result: PASS (AI notes are generating)" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "Result: FAIL ($($_.Exception.Message))" -ForegroundColor Red
    exit 3
}
