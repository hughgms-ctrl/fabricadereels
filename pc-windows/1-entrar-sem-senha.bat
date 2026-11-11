@echo off
call "%~dp0_comum.bat" || exit /b
title Fabrica de Reels - entrar sem senha
echo ============================================================
echo  ENTRAR SEM DIGITAR SENHA (opcional, recomendado)
echo  Cria uma chave neste PC e instala no Termux.
echo  Vai pedir a senha do Termux uma ultima vez.
echo ============================================================
echo.
if not exist "%USERPROFILE%\.ssh" mkdir "%USERPROFILE%\.ssh"
if not exist "%USERPROFILE%\.ssh\id_ed25519.pub" ssh-keygen -t ed25519 -N "" -f "%USERPROFILE%\.ssh\id_ed25519"
type "%USERPROFILE%\.ssh\id_ed25519.pub" | ssh -p %PORTA% %USUARIO%@%IP% "mkdir -p ~/.ssh && chmod 700 ~/.ssh && k=$(cat) && (grep -qxF \"$k\" ~/.ssh/authorized_keys 2>/dev/null || echo \"$k\" >> ~/.ssh/authorized_keys) && chmod 600 ~/.ssh/authorized_keys && echo '   Pronto: os proximos .bat entram sem senha.'"
echo.
pause
