#!/data/data/com.termux/files/usr/bin/bash
# Copia a skill da fábrica para o Hermes Agent (~/.hermes/skills/fabrica-reels).
# Não mexe em nenhuma outra configuração do Hermes.
set -euo pipefail
cd "$(dirname "$0")/.."
DESTINO="$HOME/.hermes/skills/fabrica-reels"
if [[ ! -d "$HOME/.hermes" ]]; then
  echo "  ! Não achei ~/.hermes: o Hermes Agent está instalado com outro usuário ou outra pasta?"
  echo "    Copie à mão a pasta hermes/fabrica-reels para a pasta de skills do Hermes."
  exit 1
fi
mkdir -p "$DESTINO"
cp hermes/fabrica-reels/SKILL.md "$DESTINO/SKILL.md"
echo "  ✓ Skill instalada em $DESTINO"
echo "  No Telegram, mande para o Hermes: /skills   (ela deve aparecer como fabrica-reels)"
echo "  Se não aparecer, reinicie o Hermes do jeito que você costuma (o gateway lê as skills ao iniciar)."
