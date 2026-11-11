#!/data/data/com.termux/files/usr/bin/bash
# Instala o que a fábrica precisa no Termux (Android). Pode rodar de novo sem medo.
# Uso:  bash scripts/instalar-termux.sh            (sem Whisper)
#       bash scripts/instalar-termux.sh --whisper  (compila o whisper.cpp para transcrever reels)
#
# Convive com outros projetos no mesmo Termux:
#  - NÃO roda "pkg update/upgrade": não troca a versão do Node, do Python nem de nada que já existe;
#  - só instala o programa que estiver faltando;
#  - o yt-dlp fica num ambiente Python só da fábrica (.venv), sem mexer no pip global;
#  - no crontab, só acrescenta/atualiza a linha da fábrica.
set -euo pipefail
cd "$(dirname "$0")/.."
PASTA="$(pwd)"

instalar_se_faltar() { # programa pacote
  if command -v "$1" >/dev/null 2>&1; then
    echo "  ✓ $1 já existe ($(command -v "$1")): não mexo"
  else
    echo "  + instalando $2"
    pkg install -y "$2"
  fi
}

echo "▶ Programas do Termux (só o que falta)"
instalar_se_faltar node nodejs-lts
instalar_se_faltar python python
instalar_se_faltar ffmpeg ffmpeg
instalar_se_faltar git git
instalar_se_faltar crond cronie
instalar_se_faltar sv-enable termux-services

echo "▶ yt-dlp num ambiente só da fábrica (.venv)"
[[ -d .venv ]] || python -m venv .venv
.venv/bin/pip install -q -U yt-dlp
echo "  ✓ $(.venv/bin/yt-dlp --version)"

echo "▶ Claude Code"
# O SSH com comando não lê o .bashrc, então ~/.local/bin (instalador nativo) fica fora do PATH: procura lá também.
export PATH="$HOME/.local/bin:$PATH"
CLAUDE="$(command -v claude || true)"
if [[ -n "$CLAUDE" ]] && "$CLAUDE" --version >/dev/null 2>&1; then
  echo "  ✓ $("$CLAUDE" --version) em $CLAUDE: não mexo"
else
  # O npm novo bloqueia o passo final da instalação do Claude Code; aqui ele é liberado só para esse pacote.
  npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code \
    || npm install -g @anthropic-ai/claude-code
  CLAUDE="$(command -v claude || true)"
  if [[ -n "$CLAUDE" ]] && "$CLAUDE" --version >/dev/null 2>&1; then
    echo "  ✓ $("$CLAUDE" --version) em $CLAUDE"
  else
    echo "  ! O Claude Code não abriu. Rode o 12-terminal.bat e mande o resultado de: claude --version"
  fi
fi

if [[ "${1:-}" == "--whisper" ]]; then
  echo "▶ whisper.cpp (transcrição local dos reels)"
  instalar_se_faltar clang clang
  instalar_se_faltar cmake cmake
  instalar_se_faltar make make
  # Compila dentro da pasta da fábrica: não mexe em nenhum whisper.cpp que já exista no Termux.
  W="$PASTA/.whisper.cpp"
  [[ -d "$W" ]] || git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$W"
  if [[ ! -x "$W/build/bin/whisper-cli" ]]; then
    echo "  compilando (10 a 30 min; o celular esquenta, os outros projetos continuam rodando)"
    (cd "$W" && nice -n 10 cmake -B build -DCMAKE_BUILD_TYPE=Release && nice -n 10 cmake --build build -j2 --config Release)
  fi
  mkdir -p "$PASTA/modelos"
  if [[ ! -f "$PASTA/modelos/ggml-base.bin" ]]; then
    (cd "$W" && sh ./models/download-ggml-model.sh base)
    cp "$W/models/ggml-base.bin" "$PASTA/modelos/"
  fi
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "▶ Criei o .env: edite com 'nano .env' e preencha as chaves."
fi
if [[ -x "$PASTA/.whisper.cpp/build/bin/whisper-cli" ]]; then
  sed -i "s#^WHISPER_CPP_BIN=.*#WHISPER_CPP_BIN=$PASTA/.whisper.cpp/build/bin/whisper-cli#" .env
fi
if [[ -n "${CLAUDE:-}" ]]; then
  # Caminho completo: o cron e o SSH não enxergam o mesmo PATH do terminal.
  sed -i "s#^CLAUDE_BIN=.*#CLAUDE_BIN=$CLAUDE#" .env
fi
chmod +x scripts/*.sh bin/*.mjs
mkdir -p logs data

echo "▶ Agendamento diário (cron)"
rodando() { # sem depender do pgrep, que nem todo Termux tem
  for c in /proc/[0-9]*/comm; do [[ "$(cat "$c" 2>/dev/null)" == "$1" ]] && return 0; done
  return 1
}
if rodando crond; then
  echo "  ✓ crond já está rodando: não ligo outro (senão as tarefas rodariam duas vezes)"
else
  # Liga junto com o Termux daqui pra frente e, se ainda não subiu, liga agora.
  sv-enable crond >/dev/null 2>&1 || true
  sleep 2
  if ! rodando crond; then crond 2>/dev/null || true; fi
  if rodando crond; then echo "  ✓ crond ligado"; else echo "  ! crond não ligou: feche e abra o Termux e rode o 2-instalar.bat de novo"; fi
fi
LINHA="17 6 * * * $PASTA/scripts/cron.sh"
# Lê o crontab atual (pode estar vazio) e troca só a linha da fábrica; as dos outros projetos ficam.
ATUAL="$(crontab -l 2>/dev/null || true)"
{ printf '%s\n' "$ATUAL" | grep -vF "$PASTA/scripts/cron.sh" | grep -v '^$' || true; echo "$LINHA"; } | crontab -
echo "  Agendado: todo dia às 06:17 (horário do celular). Seu crontab agora:"
crontab -l | sed 's/^/    /'

# Guarda o token do GitHub só para este repositório (não muda o git dos outros projetos).
git config credential.helper store

cat <<'FIM'

Pronto. Falta só:
  1. nano .env                         → chaves do YouTube e do Instagram
  2. Configurações do Android → Apps → Termux → Bateria → "Sem restrições"
     (senão o Android mata o Termux de madrugada e o cron não roda)
  3. Teste sem gastar nada:            npm run simular
  4. Teste de verdade:                 npm run dia
  5. Ver os roteiros do dia:           ls data/dias/$(date +%F)/
  6. Aprovar e publicar um material:   node bin/aprovar.mjs PALAVRA --publicar
FIM
