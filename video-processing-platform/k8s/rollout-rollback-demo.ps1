param(
    [string]$DeploymentName = "backend",
    [string]$ContainerName = "backend",
    [string]$GoodImage = "video-processing-platform-backend:v2",
    [string]$BadImage = "video-processing-platform-backend:bad-release",
    [int]$SuccessTimeoutSeconds = 180,
    [int]$FailTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

Write-Host "1) Baseline status" -ForegroundColor Cyan
kubectl get deployment $DeploymentName
kubectl rollout history deployment/$DeploymentName

Write-Host "`n2) Rolling update to good image: $GoodImage" -ForegroundColor Cyan
kubectl set image deployment/$DeploymentName "$ContainerName=$GoodImage"
kubectl rollout status deployment/$DeploymentName --timeout="$($SuccessTimeoutSeconds)s"
kubectl get pods -l app=video-backend

Write-Host "`n3) Trigger failed update using bad image: $BadImage" -ForegroundColor Cyan
kubectl set image deployment/$DeploymentName "$ContainerName=$BadImage"
$failed = $false
try {
    kubectl rollout status deployment/$DeploymentName --timeout="$($FailTimeoutSeconds)s"
}
catch {
    $failed = $true
    Write-Host "Rollout failed as expected for bad image." -ForegroundColor Yellow
}

if (-not $failed) {
    Write-Host "Warning: bad rollout did not fail within timeout. Check cluster state manually." -ForegroundColor Yellow
}

kubectl get pods -l app=video-backend
kubectl rollout history deployment/$DeploymentName

Write-Host "`n4) Rolling back to previous stable revision" -ForegroundColor Cyan
kubectl rollout undo deployment/$DeploymentName
kubectl rollout status deployment/$DeploymentName --timeout="$($SuccessTimeoutSeconds)s"
kubectl get pods -l app=video-backend
kubectl get endpoints backend-service
kubectl rollout history deployment/$DeploymentName

Write-Host "`nDone. Capture terminal output for PR/video evidence." -ForegroundColor Green
