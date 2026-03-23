@echo off
cd /d "%~dp0"

echo Iniciando Git Visual Manager...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js no esta instalado o no esta en el PATH.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Instalando dependencias...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Fallo la instalacion de dependencias.
        pause
        exit /b 1
    )
)

npm run electron
