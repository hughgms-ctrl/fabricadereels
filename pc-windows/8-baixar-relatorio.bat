@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - relatorio
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "DIA=%%d"
echo ============================================================
echo  BAIXAR O RELATORIO DO DIA PARA ESTE PC
echo  (roteiros, levantamento, fichas de edicao, capas e videos)
echo ============================================================
set /p DIA=Data (Enter = %DIA%): 
if not exist "%PASTA%relatorios" mkdir "%PASTA%relatorios"
scp -P %PORTA% -r %USUARIO%@%IP%:fabricadereels/data/dias/%DIA% "%PASTA%relatorios"
if errorlevel 1 (
  echo.
  echo  Nao achei o relatorio de %DIA%. A fabrica ja rodou nesse dia? Veja o 10-ver-log.bat
  pause
  exit /b
)
start "" "%PASTA%relatorios\%DIA%"
