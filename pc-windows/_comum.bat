@echo off
rem Carrega o config.txt (IP, usuario e porta do Termux). Usado pelos outros .bat.
chcp 65001 >nul
set "PASTA=%~dp0"
if not exist "%PASTA%config.txt" (
  echo.
  echo  Primeiro clique duas vezes em 0-configurar.bat
  echo.
  pause
  exit /b 1
)
for /f "usebackq tokens=1,* delims==" %%a in ("%PASTA%config.txt") do set "%%a=%%b"
set "SSH=ssh -t -p %PORTA% %USUARIO%@%IP%"
exit /b 0
