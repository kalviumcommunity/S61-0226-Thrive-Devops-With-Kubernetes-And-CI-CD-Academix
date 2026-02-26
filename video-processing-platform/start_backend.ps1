# PowerShell script to start backend
Write-Host "Starting backend..."
Set-Location "$PSScriptRoot\backend"

# ensure virtual environment is activated
if (-not (Test-Path "../.venv")) {
    Write-Warning "Virtual environment not found at ../.venv"
} else {
    & "..\.venv\Scripts\Activate.ps1"
}

# install dependencies in case they're missing or outdated
Write-Host "Installing backend requirements..."
python -m pip install -r requirements.txt

# kill any existing uvicorn/python processes on port 8000
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

# start server
python -m uvicorn main:app --host 127.0.0.1 --port 8000
