#!/data/data/com.termux/files/usr/bin/bash
# Chamado pelo cron todo dia. O cron do Termux roda com PATH mínimo: por isso o export.
export PATH="/data/data/com.termux/files/usr/bin:$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
mkdir -p logs
LOG="logs/$(date +%F).log"

command -v termux-wake-lock >/dev/null && termux-wake-lock
node bin/rodar-dia.mjs >>"$LOG" 2>&1
STATUS=$?
command -v termux-wake-unlock >/dev/null && termux-wake-unlock

# Com o app Termux:API instalado, avisa no celular quando terminar.
if command -v termux-notification >/dev/null; then
  if [[ $STATUS -eq 0 ]]; then
    termux-notification --title "Fábrica de reels" --content "Roteiros do dia prontos em data/dias/$(date +%F)"
  else
    termux-notification --title "Fábrica de reels" --content "A rodada teve erro. Veja $LOG"
  fi
fi
exit $STATUS
