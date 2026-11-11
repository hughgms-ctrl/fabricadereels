# Fábrica de Reels

Roda sozinha, todo dia, no **Termux do celular**, e tudo é grátis menos a escrita (que usa a sua assinatura do Claude).

## O processo (o mesmo do levantamento de 11/11/2026)

**Instagram · métrica principal: COMENTÁRIOS** (quase todo viral usa "comenta PALAVRA"; muito comentário = a isca funcionou)

1. Puxa os perfis grandes da trilha (`config/trilhas.json`) e os que a fábrica já descobriu antes.
2. Amplia com perfis "parecidos": o Instagram não entrega mais essa lista, então entram os **@ citados nas legendas**
   dos posts que tenham **mais de 50 mil seguidores**. Repete **2 rodadas**. Os novos ficam guardados para os próximos dias.
3. Puxa os posts dos **últimos 90 dias** de todos (paginando o perfil inteiro).
4. Mostra só os que passaram do **corte de comentários** (10 mil na trilha de IA), **do maior pro menor**,
   com perfil, link, comentários, **tema em uma linha** e a classe: ⚖️ direto · ✅ adaptável · ❌ não serve.
5. Baixa e **transcreve os 10 primeiros vídeos** que servem (Whisper no celular).

**YouTube · métrica principal: OUTLIER** (views ÷ mediana dos Shorts recentes do próprio canal, como no Kit BPC/LOAS).

Depois, para os escolhidos do dia:

- **Roteiro no formato do Kit:** forma do original, Frame 0, fala com o mesmo número de palavras, texto na tela,
  palavra-chave, **material de entrega**, **mensagem de DM** e **pontos para validar antes de gravar**.
- **Ficha de edição da referência:** link do vídeo, formato, duração, **cada corte com o tempo**, ritmo (plano médio,
  fim do gancho), **fala com tempos**, capa, **folha com um quadro de cada plano** e o **pedido pronto para o Claude
  editar o seu vídeo igual**.

Tudo sai em `data/dias/AAAA-MM-DD/<trilha>.md` (e os vídeos/quadros em `<trilha>-referencias/`).

| Trilha | Fontes | Para quem | Site de entrega |
|---|---|---|---|
| `previdenciario` | Shorts BR (outlier) + advogados BR no Instagram (comentários) | idosos, PCD, autistas e famílias | `sites/advocacia` |
| `ia-advogados` | 24 perfis gringos de IA + descobertos (comentários) + Shorts gringos (outlier) | advogados | `sites/ia` (Pakki) |

## Instalar no Termux

```bash
pkg install -y git
git clone https://github.com/hughgms-ctrl/fabricadereels ~/fabricadereels
cd ~/fabricadereels
bash scripts/instalar-termux.sh --whisper
nano .env
npm run simular
npm run dia
```

O instalador agenda a rodada para **06:17** todo dia. **Tire o Termux da otimização de bateria**
(Configurações → Apps → Termux → Bateria → Sem restrições). Com o app **Termux:API**, chega notificação no fim.

## Chaves (todas grátis)

**YouTube** (`YOUTUBE_API_KEY`): Google Cloud → YouTube Data API v3 → Credenciais → Chave de API.
Cada rodada gasta perto de 1.500 das 10.000 unidades do dia.

**Instagram** (`IG_USER_ID`, `IG_ACCESS_TOKEN`): Instagram **profissional** ligado a uma **Página do Facebook** e um
app da Meta em que você é administrador (o da Pakki serve).
1. Graph API Explorer → token de usuário com `instagram_basic`, `instagram_manage_insights` e `pages_read_engagement`.
2. Troque por token de longa duração (60 dias) e anote a data para renovar.
3. `GET /me/accounts?fields=instagram_business_account` → o `id` de `instagram_business_account` é o `IG_USER_ID`.

Limites da Meta: ~200 chamadas por hora (a rodada para em 180) e só lê contas **profissionais**.
Quando o reel usa música licenciada, a API não entrega o vídeo: o `yt-dlp` baixa pelo link (se pedir login, use
`IG_COOKIES` com uma conta secundária).

**Claude Code:** rode `claude` uma vez no Termux e faça login. A fábrica chama `claude -p` numa pasta vazia, sem
ferramentas e sem acesso aos seus arquivos.

## Sites de entrega (Vercel, grátis)

Cada material aprovado vira uma página `/<palavra>/` (é o link que vai na DM) e entra na página inicial, em formato de blog.

```bash
node bin/aprovar.mjs --lista          # o que está esperando aprovação
node bin/aprovar.mjs CASA --publicar  # aprova, gera os sites e envia para o GitHub
node bin/publicar.mjs --so-gerar      # só gera, para conferir
```

Uma vez só, na Vercel: **Add New → Project → `fabricadereels`**, Root Directory `sites/advocacia`, sem build.
Repita com `sites/ia`. A cada `git push` os dois sites se atualizam sozinhos.

Personalize em `config/sites.json`: título, assinatura (OAB), Instagram, WhatsApp, cores e `webhookLead`.
Com `webhookLead` preenchido (Pakki, GHL, n8n), a página pede nome, e-mail e WhatsApp antes de abrir o material
e envia o lead para esse endereço.

**Nada vai para o site sem aprovação.** Antes de aprovar, leia "Validar antes de gravar". Para mudar o texto,
edite `conteudo/<site>/<palavra>.json` e rode `node bin/publicar.mjs`.

## Comandos

```bash
npm run dia                                      # as duas trilhas
node bin/rodar-dia.mjs --trilha ia-advogados
node bin/rodar-dia.mjs --sem-roteiro             # só minera e transcreve (não chama o Claude)
node bin/rodar-dia.mjs --sem-ficha               # sem baixar vídeo nem montar ficha
npm run simular                                  # caminho inteiro com dados de exemplo
npm test
```

Memória entre dias: `data/usados.json` (vídeos e palavras já usados), `data/memoria-<trilha>.json` (perfis
descobertos), `data/cache-canais.json` (mediana dos canais do YouTube, 7 dias).

## Antes de publicar

- Quem assina é o advogado: confira a lista **Validar antes de gravar** de cada roteiro.
- Cadastre a palavra no Pakki Engage (ou ManyChat) como **correspondência exata**, nunca "contém".
- Materiais informativos, sem promessa de resultado (Provimento 205/2021 do CFOAB).
