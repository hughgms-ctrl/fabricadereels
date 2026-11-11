@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - atualizar
echo ============================================================
echo  BAIXAR A VERSAO NOVA DA FABRICA (depois de ajustes)
echo ============================================================
echo.
%SSH% "cd ~/fabricadereels && git pull --ff-only && npm test 2>&1 | grep -E '^# (pass|fail)'"
echo.
pause
