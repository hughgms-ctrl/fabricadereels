#!/usr/bin/env node
/**
 * Liga cada etapa da fábrica a um tópico do grupo do Telegram (rodado pelo 13-telegram.bat).
 *
 * Para cada tópico você cola o LINK de uma mensagem que está nele (no Telegram do PC:
 * botão direito na mensagem → "Copiar link da mensagem"). Do link sai o grupo e o tópico.
 * No fim, a fábrica manda uma mensagem de teste em cada tópico.
 *
 *   node bin/configurar-telegram.mjs            (pergunta tudo)
 *   node bin/configurar-telegram.mjs --testar   (só manda as mensagens de teste)
 */
import path from 'node:path';
import readline from 'node:readline/promises';
import { RAIZ, carregarEnv, lerJson, gravarJson } from '../src/util.mjs';
import { linkParaDestino, tokenDoBot, criarTelegram } from '../src/telegram.mjs';
import { ETAPAS, NOMES_ETAPAS } from '../src/avisos.mjs';

carregarEnv();
const ARQ = path.join(RAIZ, 'data', 'telegram.json');
const { trilhas } = lerJson(path.join(RAIZ, 'config', 'trilhas.json'), { trilhas: [] });
const { sites } = lerJson(path.join(RAIZ, 'config', 'sites.json'), { sites: [] });
const cfg = lerJson(ARQ, {});

const token = tokenDoBot(process.env);
if (!token) {
  console.log('\nNão achei o token do bot. Coloque TELEGRAM_BOT_TOKEN no .env da fábrica (4-chaves.bat)');
  console.log('ou confira se o Hermes guarda o dele em ~/.hermes/.env.\n');
  process.exit(1);
}
const tg = criarTelegram({ token });
const bot = await tg.quemSou().catch((e) => {
  console.log(`\nO token não funcionou: ${e.message}\n`);
  process.exit(1);
});
console.log(`\nBot: @${bot.username} (o mesmo do Hermes: a fábrica só envia, quem lê é o Hermes)\n`);

if (!process.argv.includes('--testar')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  for (const t of trilhas.filter((x) => x.ativa)) {
    const grupo = sites.find((s) => s.trilhas.includes(t.id))?.grupoTelegram || t.nome;
    console.log(`=== Grupo "${grupo}" · trilha ${t.nome} ===`);
    console.log('Em cada tópico, mande um "oi", clique com o botão direito nele → "Copiar link da mensagem" e cole aqui.');
    console.log('Enter sem nada = manter como está (ou pular).\n');
    cfg[t.id] ??= {};
    cfg[t.id].grupo = grupo;
    for (const etapa of ETAPAS) {
      const atual = cfg[t.id][etapa];
      const resp = (await rl.question(`  Tópico ${NOMES_ETAPAS[etapa]}${atual ? ' (já ligado)' : ''}: `)).trim();
      if (!resp) continue;
      const d = linkParaDestino(resp);
      if (!d) {
        console.log('    Esse link não é de mensagem de grupo (precisa ser t.me/c/...). Pulei.');
        continue;
      }
      cfg[t.id][etapa] = d;
    }
    console.log('');
  }
  rl.close();
  gravarJson(ARQ, cfg);
  console.log(`Salvo em data/telegram.json\n`);
}

console.log('Mandando uma mensagem de teste em cada tópico ligado...');
for (const t of trilhas) {
  for (const etapa of ETAPAS) {
    const d = cfg[t.id]?.[etapa];
    if (!d) continue;
    try {
      await tg.texto(d, `✅ Fábrica de Reels ligada aqui: <b>${NOMES_ETAPAS[etapa]}</b> · ${t.nome}`);
      console.log(`  ✓ ${t.nome} · ${NOMES_ETAPAS[etapa]}`);
    } catch (e) {
      console.log(`  ✗ ${t.nome} · ${NOMES_ETAPAS[etapa]}: ${e.message}`);
    }
  }
}
console.log('\nSe algum deu ✗: confira se o bot está no grupo, é administrador e o grupo tem tópicos ligados.\n');
