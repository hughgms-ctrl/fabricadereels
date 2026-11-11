#!/data/data/com.termux/files/usr/bin/bash
# O Claude Code 2.x usa um executável próprio para Linux, que não roda direto no Android.
# Este script instala um Debian leve dentro do Termux (proot-distro, ~150 MB), coloca o
# Claude Code lá dentro e aponta a fábrica para ele. Não mexe no resto do Termux.
set -euo pipefail
cd "$(dirname "$0")/.."
PASTA="$(pwd)"
DISTRO=debian

command -v proot-distro >/dev/null || pkg install -y proot-distro

if [[ ! -d "$PREFIX/var/lib/proot-distro/installed-rootfs/$DISTRO" ]]; then
  echo "▶ Instalando o Debian dentro do Termux (só para o Claude Code)"
  proot-distro install "$DISTRO"
else
  echo "  ✓ Debian já instalado"
fi

echo "▶ Claude Code dentro do Debian"
proot-distro login "$DISTRO" -- bash -c '
  set -e
  if ! command -v curl >/dev/null; then
    apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null
  fi
  [ -x /root/.local/bin/claude ] || curl -fsSL https://claude.ai/install.sh | bash
  echo "  ✓ $(/root/.local/bin/claude --version)"
'

chmod +x "$PASTA/bin/claude-debian.sh"
[[ -f .env ]] || cp .env.example .env
sed -i "s#^CLAUDE_BIN=.*#CLAUDE_BIN=$PASTA/bin/claude-debian.sh#" .env
echo "  ✓ A fábrica vai usar: $PASTA/bin/claude-debian.sh"

# O Claude Code que o instalador da fábrica pôs pelo npm não roda no Android: sai, para não confundir.
if npm ls -g --depth=0 2>/dev/null | grep -q '@anthropic-ai/claude-code'; then
  if ! claude --version >/dev/null 2>&1; then
    npm uninstall -g @anthropic-ai/claude-code >/dev/null 2>&1 || true
    echo "  ✓ Removi o Claude Code do npm que não abria"
  fi
fi
