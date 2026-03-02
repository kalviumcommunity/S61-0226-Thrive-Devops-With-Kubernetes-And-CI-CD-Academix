param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [Parameter(Mandatory = $false)]
    [string]$ReleaseName = "video-platform",

    [Parameter(Mandatory = $false)]
    [string]$Namespace = "default"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$chartPath = Join-Path $projectRoot "charts/video-processing-platform"
$baseValuesPath = Join-Path $chartPath "values.yaml"
$envValuesPath = Join-Path $chartPath "values-$Environment.yaml"

if (-not (Test-Path $envValuesPath)) {
    throw "Environment values file not found: $envValuesPath"
}

Write-Host "Deploying release '$ReleaseName' to namespace '$Namespace' using '$Environment' values..."

helm upgrade --install $ReleaseName $chartPath `
  --namespace $Namespace `
  --create-namespace `
  -f $baseValuesPath `
  -f $envValuesPath

Write-Host "Deployment completed."
