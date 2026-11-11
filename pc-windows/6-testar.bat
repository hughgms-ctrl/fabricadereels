@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - testar
echo ============================================================
echo  TESTAR SEM GASTAR NADA (dados de exemplo, sem internet)
echo  Deve terminar com "pass 20" e "fail 0".
echo ============================================================
echo.
%SSH% "cd ~/fabricadereels && npm test 2>&1 | grep -E '^# (tests|pass|fail)|^not ok' ; npm run simular && rm -rf data/simulacao"
echo.
pause
