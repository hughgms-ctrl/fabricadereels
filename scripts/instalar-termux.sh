#!/data/data/com.termux/files/usr/bin/bash
# Instala tudo o que a fábrica precisa no Termux (Android). Pode rodar de novo sem medo.
# Uso:  bash scripts/instalar-termux.sh            (sem Whisper)
#       bash scripts/instalar-termux.sh --whisper  (compila o whisper.cpp para transcrever reels)
set -euo pipefail
cd "$(dirname "$0")/.."
PASTA="$(pwd)"

echo "▶ Pacotes do Termux"
pkg update -y
pkg install -y nodejs-lts python ffmpeg git cronie termux-services

echo "▶ yt-dlp (legendas do YouTube e download de áudio)"
pip install -U yt-dlp

if ! command -v claude >/dev/null 2>&1; then
  echo "▶ Claude Code"
  npm install -g @anthropic-ai/claude-code
  echo "  Depois rode 'claude' uma vez e faça login com a sua conta."
fi

if [[ "${1:-}" == "--whisper" ]]; then
  echo "▶ whisper.cpp (transcrição local dos reels)"
  pkg install -y clang cmake make
  if [[ ! -d "$HOME/whisper.cpp" ]]; then
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$HOME/whisper.cpp"
  fi
  (cd "$HOME/whisper.cpp" && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j"$(nproc)" --config Release)
  ln -sf "$HOME/whisper.cpp/build/bin/whisper-cli" "$PREFIX/bin/whisper-cli"
  mkdir -p "$PASTA/modelos"
  if [[ ! -f "$PASTA/modelos/ggml-base.bin" ]]; then
    (cd "$HOME/whisper.cpp" && sh ./models/download-ggml-model.sh base)
    cp "$HOME/whisper.cpp/models/ggml-base.bin" "$PASTA/modelos/"
  fi
fi

[[ -f .env ]] || { cp .env.example .env; echo "▶ Criei o .env: edite com 'nano .env' e preencha as chaves."; }
chmod +x scripts/*.sh bin/*.mjs
mkdir -p logs data

echo "▶ Agendamento diário (cron)"
sv-enable crond 2>/dev/null || echo "  Feche e abra o Termux uma vez e rode de novo para ligar o crond."
LINHA="17 6 * * * $PASTA/scripts/cron.sh"
( crontab -l 2>/dev/null | grep -v 'fabrica-reels-juridico/scripts/cron.sh' ; echo "$LINHA" ) | crontab -
echo "  Agendado: todo dia às 06:17 (horário do celular)."

cat <<'FIM'

Pronto. Falta só:
  1. nano .env                         → chaves do YouTube e do Instagram
  2. Configurações do Android → Apps → Termux → Bateria → "Sem restrições"
     (senão o Android mata o Termux de madrugada e o cron não roda)
  3. Teste sem gastar nada:            npm run simular
  4. Teste de verdade:                 npm run dia
FIM
