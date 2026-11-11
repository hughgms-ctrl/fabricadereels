@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - chaves
echo ============================================================
echo  COLOCAR AS CHAVES (.env)
echo  Abre o editor nano no celular. Ande com as setas.
echo    YOUTUBE_API_KEY=  cole a chave logo depois do =
echo  Para colar no terminal: botao direito do mouse.
echo  Salvar: Ctrl+O e Enter.   Sair: Ctrl+X.
echo ============================================================
echo.
pause
%SSH% "cd ~/fabricadereels && nano .env"
