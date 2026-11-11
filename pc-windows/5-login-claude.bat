@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - login do Claude
echo ============================================================
echo  LOGIN DO CLAUDE CODE NO CELULAR (uma vez)
echo  Se pedir login, abra o link que aparecer no navegador do PC.
echo  Quando estiver logado, digite /exit e Enter.
echo ============================================================
echo.
%SSH% "cd ~ && claude"
echo.
pause
