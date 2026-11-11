@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - rodar agora
echo ============================================================
echo  RODAR A FABRICA AGORA
echo    1 = as duas trilhas
echo    2 = so previdenciario (BPC/LOAS)
echo    3 = so IA para advogados
echo ============================================================
set "OP=1"
set /p OP=Escolha (Enter = 1): 
set "ARG="
if "%OP%"=="2" set "ARG=--trilha previdenciario"
if "%OP%"=="3" set "ARG=--trilha ia-advogados"
echo.
echo  Roda no celular em segundo plano: pode fechar esta janela que continua.
echo  Para parar de acompanhar: Ctrl+C.
echo.
%SSH% "cd ~/fabricadereels && mkdir -p logs && (nohup nice -n 10 node bin/rodar-dia.mjs %ARG% > logs/manual.log 2>&1 &) && sleep 2 && tail -n +1 -f logs/manual.log"
