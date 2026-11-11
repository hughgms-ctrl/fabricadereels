@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - terminal
echo  Terminal do celular, ja na pasta da fabrica. Para sair: exit
%SSH% "cd ~/fabricadereels 2>/dev/null; exec bash -l"
