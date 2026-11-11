@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Fabrica de Reels - configurar
echo ============================================================
echo  CONFIGURAR O ACESSO AO CELULAR (so uma vez)
echo ============================================================
echo.
echo  1. No app do Tailscale, veja o IP do celular (comeca com 100.)
set /p IP=    IP do celular: 
echo.
echo  2. No Termux, o comando whoami mostra o usuario (ex.: u0_a123)
set /p USUARIO=    Usuario do Termux: 
echo.
echo  3. Porta do SSH do Termux (Enter = 8022)
set "PORTA=8022"
set /p PORTA=    Porta: 
rem Tira espacos digitados sem querer
set "IP=%IP: =%"
set "USUARIO=%USUARIO: =%"
set "PORTA=%PORTA: =%"
echo %IP%| findstr /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul || (
  echo.
  echo  O IP "%IP%" nao esta no formato certo: sao 4 numeros separados por ponto, ex.: 100.94.189.8
  echo  Rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
(
echo IP=%IP%
echo USUARIO=%USUARIO%
echo PORTA=%PORTA%
)> config.txt
echo.
echo  Testando a conexao (pode pedir a senha do Termux)...
ssh -p %PORTA% %USUARIO%@%IP% "echo; echo '   OK: conectado no celular como' $(whoami); echo"
if errorlevel 1 (
  echo.
  echo  Nao conectou. Confira: Tailscale ligado nos dois, Termux aberto e o sshd rodando.
  echo  Para mudar os dados, rode este arquivo de novo.
)
echo.
pause
