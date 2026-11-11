#!/data/data/com.termux/files/usr/bin/bash
# Roda o Claude Code instalado no Debian (proot-distro) como se fosse o comando `claude`.
# A pasta temporária do Termux entra no Debian no MESMO caminho, para o --system-prompt-file
# e a pasta de trabalho que a fábrica cria continuarem válidos lá dentro.
args=(--bind "$PREFIX/tmp:$PREFIX/tmp")
case "$PWD" in
  "$PREFIX/tmp"*) args+=(--work-dir "$PWD") ;;
esac
exec proot-distro login debian "${args[@]}" -- /root/.local/bin/claude "$@"
