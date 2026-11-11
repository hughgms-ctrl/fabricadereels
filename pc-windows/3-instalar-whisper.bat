@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - Whisper
echo ============================================================
echo  INSTALAR O WHISPER (transcricao dos reels do Instagram)
echo  Compila no celular: 10 a 30 minutos, o celular esquenta.
echo  Seus outros projetos continuam rodando (prioridade baixa).
echo ============================================================
echo.
%SSH% "cd ~/fabricadereels && bash scripts/instalar-termux.sh --whisper"
echo.
pause
