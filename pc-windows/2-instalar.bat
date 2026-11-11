@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - instalar
echo ============================================================
echo  INSTALAR / ATUALIZAR A FABRICA NO CELULAR
echo  Nao atualiza pacotes do Termux nem mexe nos seus outros projetos:
echo  so instala o que falta e acrescenta UMA linha no crontab.
echo ============================================================
echo.
%SSH% "command -v git >/dev/null || pkg install -y git; if [ -d ~/fabricadereels/.git ]; then cd ~/fabricadereels && git pull --ff-only; else git clone https://github.com/hughgms-ctrl/fabricadereels ~/fabricadereels; fi && cd ~/fabricadereels && bash scripts/instalar-termux.sh"
echo.
pause
