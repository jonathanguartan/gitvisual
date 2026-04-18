@echo off
title Git Visual Manager — Build
color 0A
cd /d "%~dp0"

echo.
echo  =========================================
echo   Git Visual Manager — Generar Binario
echo  =========================================
echo.

REM ── Verificar Node.js ────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Node.js no encontrado.
    echo  Descarga e instala Node.js desde https://nodejs.org
    echo.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER%

REM ── Instalar dependencias si faltan ──────────────────────────────────────────
if not exist node_modules (
    echo.
    echo  [1/3] Instalando dependencias ^(npm install^)...
    call npm install
    if errorlevel 1 ( color 0C & echo  [ERROR] npm install fallo & echo. & pause & exit /b 1 )
) else (
    echo  [1/3] node_modules OK
)

REM ── Instalar electron-builder si no está ─────────────────────────────────────
if not exist node_modules\electron-builder (
    echo.
    echo  [2/3] Instalando electron-builder...
    call npm install --save-dev electron-builder
    if errorlevel 1 ( color 0C & echo  [ERROR] No se pudo instalar electron-builder & echo. & pause & exit /b 1 )
) else (
    echo  [2/3] electron-builder OK
)

REM ── Generar icono si no existe ───────────────────────────────────────────────
if not exist "electron\icons\icon256.png" (
    echo  [2/3] Generando icono por defecto...
    node -e "const z=require('zlib'),fs=require('fs'),p=require('path');const cT=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);cT[i]=c;}const crc=b=>{let c=0xFFFFFFFF;for(const x of b)c=cT[(c^x)&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;};const ch=(t,d)=>{const tb=Buffer.from(t,'ascii'),l=Buffer.alloc(4),cb=Buffer.alloc(4);l.writeUInt32BE(d.length);cb.writeUInt32BE(crc(Buffer.concat([tb,d])));return Buffer.concat([l,tb,d,cb]);};const s=256,r=Buffer.alloc(1+s*3);for(let x=0;x<s;x++){r[1+x*3]=137;r[2+x*3]=180;r[3+x*3]=250;}const raw=Buffer.concat(Array.from({length:s},()=>r));const ih=Buffer.alloc(13);ih.writeUInt32BE(s,0);ih.writeUInt32BE(s,4);ih[8]=8;ih[9]=2;const out=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',z.deflateSync(raw)),ch('IEND',Buffer.alloc(0))]);fs.mkdirSync(p.join('electron','icons'),{recursive:true});fs.writeFileSync(p.join('electron','icons','icon256.png'),out);console.log('Icono generado.');"
)

REM ── Build ────────────────────────────────────────────────────────────────────
echo.
echo  [3/3] Generando binarios para Windows x64...
echo  ^(Puede tardar 2-5 minutos la primera vez^)
echo.
call npx electron-builder --win
if errorlevel 1 (
    color 0C
    echo.
    echo  [ERROR] El build fallo. Revisa los mensajes de arriba.
    echo.
    pause & exit /b 1
)

REM ── Listo ────────────────────────────────────────────────────────────────────
color 0A
echo.
echo  =========================================
echo   Build completado exitosamente
echo  =========================================
echo.
echo  Archivos generados en:  dist\
echo    - GitVisualManager Setup.exe   ^(instalador^)
echo    - GitVisualManager-portable.exe ^(sin instalar^)
echo.
if exist dist ( start "" explorer dist )
pause
