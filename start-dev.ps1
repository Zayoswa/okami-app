Write-Host "Iniciando backend FastAPI..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend-fastapi'; .\.venv\Scripts\Activate.ps1; uvicorn main:app --reload"

Write-Host "Iniciando frontend React..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend_react'; npm run dev"

Write-Host "Okami MVP iniciado."