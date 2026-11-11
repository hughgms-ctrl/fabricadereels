#!/data/data/com.termux/files/usr/bin/bash
# Chamado pelo cron todo dia. O cron do Termux roda com PATH mínimo: por isso o export.
cd "$(dirname "$0")/.." || exit 1
export PATH="$(pwd)/.venv/bin:/data/data/com.termux/files/usr/bin:$HOME/.local/bin:$PATH"
mkdir -p logs
LOG="logs/$(date +%F).log"

# Liga a trava de "não dormir" e NUNCA desliga: ela vale para o Termux inteiro, e soltá-la
# deixaria o celular dormir com os seus outros projetos rodando.
command -v termux-wake-lock >/dev/null && termux-wake-lock
# Prioridade baixa: se o celular estiver ocupado com outro projeto, a fábrica cede a vez.
nice -n 10 node bin/rodar-dia.mjs >>"$LOG" 2>&1
STATUS=$?

# Com o app Termux:API instalado, avisa no celular quando terminar.
if command -v termux-notification >/dev/null; then
  if [[ $STATUS -eq 0 ]]; then
    termux-notification --title "Fábrica de reels" --content "Roteiros do dia prontos em data/dias/$(date +%F)"
  else
    termux-notification --title "Fábrica de reels" --content "A rodada teve erro. Veja $LOG"
  fi
fi
exit $STATUS
