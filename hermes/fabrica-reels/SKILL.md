---
name: fabrica-reels
description: Opera a Fábrica de Reels (pautas, roteiros, ajustes, publicação e perfis) a partir dos grupos "Advocacia" e "Hugo Especialista em IA" no Telegram. Use quando o Hugo pedir roteiro de uma pauta, ajuste de roteiro, publicação de material, ou mexer na lista de perfis, nesses dois grupos.
---

# Fábrica de Reels

A fábrica fica em `~/fabricadereels` (Termux) e roda sozinha às 06:17. Ela **envia** as
mensagens de cada etapa para os tópicos dos grupos; **você (Hermes) recebe as respostas do
Hugo e chama os comandos abaixo**. A fábrica nunca lê o Telegram: só você lê.

## Onde vale

| Grupo | Trilha (`--trilha`) |
|---|---|
| **Advocacia** | `previdenciario` |
| **Hugo Especialista em IA** | `ia-advogados` |

- No grupo **Pakki** e em conversas privadas: **não use esta skill**. A Pakki não muda.
- Se não tiver certeza de qual grupo é qual, rode `cat ~/fabricadereels/data/telegram.json`
  (cada trilha tem o `chatId` do grupo dela).

## Etapas e tópicos

`Mapeamento → Pautas → Roteiro → Edição → Publicação → Métricas`

- Mapeamento, Pautas, Roteiro e Edição chegam sozinhos às 06:17.
- **Publicação só acontece quando o Hugo escreve "publica PALAVRA"**. Nunca publique por
  conta própria, nem se ele disser "tá bom" ou "aprovado" sem a palavra. Na dúvida, pergunte:
  "Quer que eu publique o material PALAVRA no site?"

## O que o Hugo escreve → o que você roda

Rode sempre dentro de `~/fabricadereels`. Os comandos que chamam o Claude levam de 1 a 5
minutos: avise "escrevendo, chega no tópico Roteiro em alguns minutos" e rode.

| Hugo escreve (exemplos) | Comando |
|---|---|
| "roteiro 4", "faz a pauta 4" | `node bin/roteiro.mjs --trilha <trilha> --pauta 4` |
| "ajusta CASA: encurta a fala", "CASA: troca o gancho por uma pergunta" | `node bin/ajustar.mjs CASA "encurta a fala"` |
| "publica CASA" | `node bin/aprovar.mjs CASA --publicar` |
| "o que falta aprovar?", "pendentes" | `node bin/aprovar.mjs --lista` |
| "tira @fulano" | `node bin/perfis.mjs tirar <trilha> @fulano` |
| "adiciona @ciclano" | `node bin/perfis.mjs adicionar <trilha> @ciclano` |
| "quais perfis?" | `node bin/perfis.mjs listar <trilha>` |
| "roda o mapeamento agora" | `nohup node bin/rodar-dia.mjs --trilha <trilha> > logs/manual.log 2>&1 &` (avise que leva de 10 a 30 min) |
| "deu certo hoje?", "log" | `tail -n 40 logs/$(date +%F).log` |

- A palavra-chave é sempre uma palavra em MAIÚSCULAS sem acento (CASA, PRAZO, SIGILO).
  Converta o que o Hugo escrever: "publica casa" → `CASA`.
- Responda no mesmo tópico em que o Hugo escreveu, curto: o que fez e o resultado
  (a última linha do comando). As mensagens completas a fábrica manda sozinha nos tópicos.
- Se o comando der erro, mande a mensagem de erro como veio e não tente consertar arquivos
  da fábrica por conta própria.

## Nunca

- Publicar sem "publica PALAVRA".
- Mostrar ou copiar o conteúdo do `.env` (chaves e tokens).
- Editar arquivos em `config/`, `src/` ou `bin/` (vêm do GitHub e o Hugo atualiza pelo PC).
- Rodar `git push`, `git reset` ou apagar pastas em `data/`.
