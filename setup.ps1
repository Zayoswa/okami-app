Write-Host "Configurando Okami APP..."
Write-Host ""

# Backend
Write-Host "Configurando backend..."

Set-Location "$PSScriptRoot\backend-fastapi"

if (-Not (Test-Path ".venv")) {
    Write-Host "Creando entorno virtual..."
    python -m venv .venv
}

Write-Host "Instalando dependencias de Python..."
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

# Frontend
Write-Host ""
Write-Host "Configurando frontend..."

Set-Location "$PSScriptRoot\frontend_react"

Write-Host "Instalando dependencias de Node..."
npm install

# Volver a la raíz
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "Configuracion terminada."
Write-Host "Ahora puedes ejecutar:"
Write-Host ".\start-dev.ps1"