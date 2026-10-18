@echo off
chcp 65001 >nul
echo A compilacao de v12 agora gera o jogo desktop instalado com janela propria.
echo Use build_windows_installer.bat para criar o instalador completo.
call "%~dp0build_windows_installer.bat"
