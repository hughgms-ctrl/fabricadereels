@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - aprovar
echo ============================================================
echo  APROVAR UM MATERIAL E PUBLICAR NO SITE
echo  Antes, leia no relatorio a lista "Validar antes de gravar".
echo ============================================================
echo.
echo  Esperando aprovacao:
%SSH% "cd ~/fabricadereels && node bin/aprovar.mjs --lista"
echo.
set "PALAVRA="
set /p PALAVRA=Palavra para aprovar (Enter = sair): 
if "%PALAVRA%"=="" exit /b
echo %PALAVRA%| findstr /r /x "[A-Za-z0-9][A-Za-z0-9]*" >nul || (echo  Use so letras e numeros. & pause & exit /b)
%SSH% "cd ~/fabricadereels && node bin/aprovar.mjs %PALAVRA% --publicar"
echo.
pause
