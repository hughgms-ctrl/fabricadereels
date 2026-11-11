@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - Telegram
echo ============================================================
echo  LIGAR A FABRICA AOS GRUPOS DO TELEGRAM (uma vez)
echo.
echo  Antes: nos grupos "Advocacia" e "Hugo Especialista em IA",
echo  com Topicos ligados e o bot do Hermes como administrador,
echo  crie os topicos: Mapeamento, Pautas, Roteiro, Edicao,
echo  Publicacao e Metricas. Mande um "oi" em cada um.
echo.
echo  Aqui: para cada topico, no Telegram do PC clique com o botao
echo  direito no "oi" e escolha "Copiar link da mensagem".
echo  Cole aqui com o botao direito do mouse e Enter.
echo ============================================================
echo.
pause
%SSH% "cd ~/fabricadereels && git pull --ff-only -q; node bin/configurar-telegram.mjs"
echo.
pause
