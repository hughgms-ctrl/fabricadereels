@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - Hermes
echo ============================================================
echo  ENSINAR O HERMES A OPERAR A FABRICA (uma vez)
echo  Copia a skill "fabrica-reels" para o Hermes Agent no celular.
echo  Nao mexe no resto da configuracao do Hermes nem no grupo da Pakki.
echo ============================================================
echo.
%SSH% "cd ~/fabricadereels && git pull --ff-only -q; bash scripts/instalar-hermes-skill.sh"
echo.
pause
