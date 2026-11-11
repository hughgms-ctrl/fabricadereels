@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - log
echo ============================================================
echo  ULTIMAS LINHAS DO LOG (rodada automatica das 06:17 e manual)
echo ============================================================
echo.
%SSH% "cd ~/fabricadereels && for f in logs/$(date +%%F).log logs/manual.log; do [ -f $f ] && echo \"--- $f\" && tail -n 40 $f; done; echo; echo '--- agendamento:'; crontab -l | grep fabricadereels"
echo.
pause
