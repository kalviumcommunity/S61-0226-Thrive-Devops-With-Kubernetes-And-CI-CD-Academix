param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.InterfaceAlias -notmatch "Loopback|vEthernet"
    } |
    Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $lanIp) {
    $lanIp = "127.0.0.1"
}

$apiUrl = "http://$lanIp:$BackendPort"
Write-Host "LAN startup"
Write-Host "Backend API URL: $apiUrl"
Write-Host "Frontend URL: http://$lanIp:$FrontendPort"

$backendCommand = @"
Set-Location '$root\backend'
if (Test-Path '..\.venv\Scripts\Activate.ps1') {
    & '..\.venv\Scripts\Activate.ps1'
}
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port $BackendPort
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Start-Sleep -Seconds 2

Set-Location "$root\frontend"
$env:NEXT_PUBLIC_API_URL = $apiUrl
$env:NEXT_PUBLIC_API_BASE_URL = $apiUrl

npm run dev -- --hostname 0.0.0.0 --port $FrontendPort --turbo=false
