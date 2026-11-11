# Fábrica de Reels Jurídicos

Todo dia, sozinha, no Termux do celular:

1. **Minera** vídeos curtos que viralizaram, de graça:
   - **YouTube Shorts** pela API oficial (cota grátis de 10 mil unidades por dia);
   - **Reels do Instagram** de perfis profissionais pela API oficial da Meta (Business Discovery).
2. **Ranqueia por outlier**: views (ou comentários) do vídeo ÷ mediana dos posts recentes do mesmo autor.
   Um vídeo com 500 mil views num canal que costuma ter 3 mil vale mais que 1 milhão num canal que sempre tem 1 milhão.
3. **Transcreve** a fala: legenda do YouTube via `yt-dlp` (custo zero) ou Whisper rodando no celular (reels).
4. **Escreve no formato do Kit Reels** (Claude Code, com a sua assinatura): forma do original, Frame 0,
   fala com o mesmo número de palavras, texto na tela, palavra-chave, material de entrega, mensagem de DM
   e os pontos jurídicos para validar antes de gravar.
5. **Salva** em `data/dias/AAAA-MM-DD/<trilha>.md` e avisa no celular.

Duas trilhas, em `config/trilhas.json`:

| Trilha | Fonte | Para quem é o reel |
|---|---|---|
| `previdenciario` | Shorts brasileiros de BPC/LOAS e INSS | idosos, PCD, autistas e famílias |
| `ia-advogados` | virais gringos de IA e Claude (YouTube + 24 perfis do Instagram) | advogados |

## Instalar no Termux

```bash
pkg install -y git
git clone https://github.com/<você>/fabrica-reels-juridico ~/fabrica-reels-juridico
cd ~/fabrica-reels-juridico
bash scripts/instalar-termux.sh            # acrescente --whisper para transcrever reels
nano .env                                  # chaves (veja abaixo)
npm run simular                            # testa tudo sem rede e sem gastar
npm run dia                                # rodada de verdade
```

O instalador agenda a rodada para **06:17** todo dia. **Tire o Termux da otimização de bateria**
(Configurações → Apps → Termux → Bateria → Sem restrições), senão o Android mata o processo de madrugada.
Com o app **Termux:API** instalado, chega uma notificação quando os roteiros ficam prontos.

## Chaves (todas grátis)

**YouTube** — `YOUTUBE_API_KEY`
1. console.cloud.google.com → crie um projeto.
2. APIs e serviços → Biblioteca → **YouTube Data API v3** → Ativar.
3. Credenciais → Criar credenciais → **Chave de API**. Restrinja a chave à YouTube Data API v3.

Cada rodada gasta perto de 1.500 das 10.000 unidades do dia (cada busca custa 100; o resto custa 1).

**Instagram** — `IG_USER_ID` e `IG_ACCESS_TOKEN`
Precisa de um Instagram **profissional** ligado a uma **Página do Facebook**, e de um app da Meta
em que você seja administrador (o app da Pakki serve).
1. No Graph API Explorer, gere um token de usuário com `instagram_basic`, `pages_show_list` e `pages_read_engagement`.
2. Troque por um token de longa duração (60 dias).
3. `GET /me/accounts?fields=instagram_business_account` → o número em `instagram_business_account.id` é o `IG_USER_ID`.

Só aparecem perfis **profissionais** (criador ou empresa). Conta pessoal não é lida por essa API.

**Claude Code** — rode `claude` uma vez no Termux e faça login. A fábrica usa `claude -p` numa pasta vazia,
sem ferramentas e sem acesso aos seus arquivos.

## Comandos

```bash
npm run dia                         # as duas trilhas
node bin/rodar-dia.mjs --trilha previdenciario
node bin/rodar-dia.mjs --sem-roteiro   # só minera e transcreve (não chama o Claude)
npm run simular                     # caminho inteiro com dados de exemplo
npm test
```

`data/usados.json` guarda os vídeos e as palavras-chave já usados, para não repetir. Apague uma linha dele para
liberar de novo.

## Antes de publicar

- Cada roteiro traz a lista **Validar antes de gravar**. Quem assina é o advogado.
- Cadastre a palavra-chave no Pakki Engage (ou ManyChat) como **correspondência exata**, nunca "contém":
  no nicho as pessoas comentam o próprio caso e qualquer palavra parecida dispararia a entrega.
- Materiais informativos, sem promessa de resultado (Provimento 205/2021 do CFOAB).
