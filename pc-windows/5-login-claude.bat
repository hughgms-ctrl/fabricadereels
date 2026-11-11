@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - Claude Code
echo ============================================================
echo  CLAUDE CODE NO CELULAR (uma vez)
echo  O Claude Code atual nao roda direto no Android. Este arquivo
echo  instala um Debian leve dentro do Termux (~150 MB, alguns minutos),
echo  coloca o Claude Code la dentro e abre para voce fazer o login.
echo  Nao mexe no resto do Termux nem nos seus outros projetos.
echo.
echo  No login: copie o link que aparecer, abra no navegador do PC,
echo  entre com a sua conta e cole o codigo de volta aqui.
echo  Quando estiver logado, digite /exit e Enter.
echo ============================================================
echo.
pause
%SSH% "cd ~/fabricadereels && git pull --ff-only -q && bash scripts/instalar-claude-debian.sh && proot-distro login debian -- /root/.local/bin/claude"
echo.
pause
