---
name: fabrica-reels
description: Opera a Fábrica de Reels nos grupos de reels do Hugo no Telegram (advocacia/previdenciário e IA para advogados), com uma diretriz por tópico (Mapeamento, Pautas, Roteiro, Edição, Publicação, Métricas). Use quando o Hugo escrever num desses tópicos ou pedir pauta, roteiro, ajuste, publicação ou mudança de perfis.
---

# Fábrica de Reels

A fábrica fica em `~/fabricadereels` (Termux). Às 06:17 ela faz sozinha só o **Mapeamento** e
as **Pautas**; os roteiros saem quando o Hugo escolhe. Ela **envia** as
mensagens de cada etapa para os tópicos; **você (Hermes) recebe as respostas do Hugo e
chama os comandos abaixo**. A fábrica nunca lê o Telegram: só você lê.

## Qual grupo é qual trilha

Não dependa do nome do grupo (ele pode mudar). Rode uma vez por conversa:

```bash
cat ~/fabricadereels/data/telegram.json
```

Cada trilha tem o `chatId` do grupo dela e o `threadId` de cada tópico. Compare com o
chat e o tópico da mensagem que chegou:

| Trilha (`--trilha`) | Grupo (hoje) | Público dos reels |
|---|---|---|
| `previdenciario` | Reels Advocacia | idosos, PCD, autistas e famílias no INSS |
| `ia-advogados` | Hugo Especialista em IA | advogados que usam IA |

- No grupo **Pakki** e em conversas privadas: **não use esta skill**. A Pakki não muda.
- Se a mensagem não vier de nenhum `chatId` do arquivo, não rode comando da fábrica.

## Regras gerais

- Rode sempre dentro de `~/fabricadereels`. Os comandos só leem e escrevem dentro dessa
  pasta (e publicam o site pelo `git push` do próprio repositório da fábrica).
- Comandos que chamam o Claude (roteiro, ajuste, mapeamento) levam de 1 a 5 minutos:
  responda "escrevendo, chega no tópico Roteiro em alguns minutos" e rode.
- A palavra-chave é sempre MAIÚSCULA e sem acento: "publica casa" → `CASA`.
- Responda curto, no mesmo tópico: o que fez e a última linha do comando. As mensagens
  completas a fábrica manda sozinha.
- Erro: mande a mensagem do erro como veio. Não tente consertar arquivos da fábrica.

## Diretriz de cada tópico

### Mapeamento
O que chega sozinho: resumo do dia (perfis lidos, perfis novos, quantos passaram do corte).
Seu papel: cuidar da **lista de perfis** e responder dúvidas sobre o mapeamento.

| Hugo escreve | Você roda |
|---|---|
| "tira @fulano" | `node bin/perfis.mjs tirar <trilha> @fulano` |
| "adiciona @ciclano" | `node bin/perfis.mjs adicionar <trilha> @ciclano` |
| "quais perfis?" | `node bin/perfis.mjs listar <trilha>` |
| "prioriza @fulano" | `node bin/perfis.mjs priorizar <trilha> @fulano` (lido todo dia, corte menor, ⭐ no topo das Pautas) |
| "tira prioridade @fulano" | `node bin/perfis.mjs despriorizar <trilha> @fulano` |
| "roda o mapeamento agora" | `nohup node bin/rodar-dia.mjs --trilha <trilha> > logs/manual.log 2>&1 &` (avise: 20 a 40 min) |
| "deu certo hoje?", "log" | `tail -n 40 logs/$(date +%F).log` |

### Pautas
O que chega sozinho às 06:17: lista numerada das pautas do dia (tema, números, link e a ideia
para o público da trilha). **Nenhum roteiro é escrito sem a escolha do Hugo.**
Seu papel: transformar a escolha em roteiro.

| Hugo escreve | Você roda |
|---|---|
| "roteiro 4", "quero a 4" | `node bin/roteiro.mjs --trilha <trilha> --pauta 4` |
| "roteiro 2, 5 e 7", "faz a 2 a 5 e a 7" | `node bin/roteiro.mjs --trilha <trilha> --pauta 2,5,7` (um comando só, em segundo plano) |

Para várias pautas, rode em segundo plano para não travar a conversa:
`nohup node bin/roteiro.mjs --trilha <trilha> --pauta 2,5,7 > logs/roteiro.log 2>&1 &`
e avise: "escrevendo 3 roteiros, chegam no tópico Roteiro em alguns minutos cada".

Se a pauta já virou roteiro, o comando avisa qual palavra: repasse ao Hugo.

### Roteiro
O que chega (depois de uma escolha nas Pautas): roteiro completo (tema do original, Frame 0, fala, cartelas, pontos a validar, material, DM).
Seu papel: **ajustar** o texto quando o Hugo pedir. Você não reescreve o roteiro por conta
própria: quem escreve é o comando.

| Hugo escreve | Você roda |
|---|---|
| "ajusta CASA: encurta a fala", "CASA: troca o gancho por uma pergunta" | `node bin/ajustar.mjs CASA "encurta a fala"` |
| "o que falta aprovar?", "pendentes" | `node bin/aprovar.mjs --lista` |

Se o Hugo disser "aprovado", "tá bom" ou "pode" sem "publica PALAVRA", **não publique**:
responda "Quer que eu publique o material PALAVRA no site? Escreva: publica PALAVRA".

### Edição
O que chega (junto com cada roteiro): tema, folha de planos (imagem), link da referência, a fala e as cartelas a gravar, ritmo e o pedido de edição.
Seu papel: tirar dúvidas sobre a referência e o pedido de edição. Se o Hugo mandar o vídeo
bruto aqui, responda que a edição automática ainda não está ligada e que ele pode usar o
"Pedido para o Claude editar igual" da mensagem da fábrica.

### Publicação
Seu papel: **publicar só com a ordem explícita**.

| Hugo escreve | Você roda |
|---|---|
| "publica CASA" | `node bin/aprovar.mjs CASA --publicar` |
| "pendentes" | `node bin/aprovar.mjs --lista` |

Depois de publicar, a fábrica manda o link do site neste tópico. Lembre o Hugo de cadastrar
a palavra na automação de comentários como **correspondência exata**.

### Métricas
Ainda não há métricas automáticas. Se o Hugo perguntar, diga que essa etapa vem depois.

## Nunca

- Publicar sem "publica PALAVRA".
- Mostrar ou copiar o conteúdo do `.env` (chaves e tokens).
- Editar arquivos em `config/`, `src/` ou `bin/` (vêm do GitHub; o Hugo atualiza pelo PC).
- Rodar `git reset`, apagar pastas em `data/` ou rodar comando da fábrica no grupo da Pakki.
