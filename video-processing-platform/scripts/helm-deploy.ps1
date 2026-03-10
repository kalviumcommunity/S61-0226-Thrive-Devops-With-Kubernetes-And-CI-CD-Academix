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

function Resolve-HelmExecutable {
  $helmCmd = Get-Command helm -ErrorAction SilentlyContinue
  if ($helmCmd) {
    return $helmCmd.Source
  }

  $wingetLinkHelm = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\helm.exe"
  if (Test-Path $wingetLinkHelm) {
    return $wingetLinkHelm
  }

  $programFilesHelm = "C:\Program Files\Helm\helm.exe"
  if (Test-Path $programFilesHelm) {
    return $programFilesHelm
  }

  throw "Helm CLI not found. Install via 'winget install --id Helm.Helm -e' or add helm.exe to PATH."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$chartPath = Join-Path $projectRoot "charts/video-processing-platform"
$baseValuesPath = Join-Path $chartPath "values.yaml"
$envValuesPath = Join-Path $chartPath "values-$Environment.yaml"

if (-not (Test-Path $envValuesPath)) {
    throw "Environment values file not found: $envValuesPath"
}

Write-Host "Deploying release '$ReleaseName' to namespace '$Namespace' using '$Environment' values..."

$helmExe = Resolve-HelmExecutable

& $helmExe upgrade --install $ReleaseName $chartPath `
  --namespace $Namespace `
  --create-namespace `
  -f $baseValuesPath `
  -f $envValuesPath

Write-Host "Deployment completed."
