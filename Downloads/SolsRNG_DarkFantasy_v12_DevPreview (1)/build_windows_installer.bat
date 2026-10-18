@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo =====================================================
echo   SOL'S RNG - DARK FANTASY - INSTALADOR DO WINDOWS
echo =====================================================
where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: instale Node.js 24 LTS ou mais recente para compilar o instalador.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  %PY% -m venv .venv
  if errorlevel 1 goto fail
)
call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip
python -m pip install -r requirements.txt pyinstaller
if errorlevel 1 goto fail
call npm --prefix desktop install
if errorlevel 1 goto fail
if not exist "desktop\node_modules\socket.io-client\dist\socket.io.min.js" (
  echo ERRO: a biblioteca local Socket.IO não foi encontrada após npm install.
  goto fail
)
copy /y "desktop\node_modules\socket.io-client\dist\socket.io.min.js" "static\socket.io.min.js" >nul
if errorlevel 1 goto fail
python -m PyInstaller --noconfirm --clean --onedir --name "SolsRNGDarkFantasyServer" --icon "static\sols-rng.ico" --add-data "static;static" app.py
if errorlevel 1 goto fail
call npm --prefix desktop run dist
if errorlevel 1 goto fail
echo.
echo INSTALADOR CRIADO NA PASTA release.
echo O arquivo SolsRNGDarkFantasy-Setup-0.12.0.exe instala o jogo com icone, atalho e janela propria.
echo A compilacao precisa de internet para obter as dependencias durante o build.
pause
exit /b 0
:fail
echo.
echo ERRO no processo de build. Confira a mensagem e as dependencias acima.
pause
exit /b 1
