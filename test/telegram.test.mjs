import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkParaDestino, tokenDoBot, pre, empacotar, esc } from '../src/telegram.mjs';
import { criarAvisos, msgPautas, msgRoteiro, msgEdicao, msgPublicacao } from '../src/avisos.mjs';
import { criarInstagram } from '../src/instagram.mjs';
import { anexarAoDia, acharRoteiro } from '../src/etapas.mjs';
import { criarFetchSimulado, chamarSimulado } from './simulacao.mjs';

const temp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('telegram: link de mensagem vira grupo + tópico', () => {
  assert.deepEqual(linkParaDestino('https://t.me/c/1234567890/5/10'), { chatId: '-1001234567890', threadId: 5 });
  assert.deepEqual(linkParaDestino('https://t.me/c/1234567890/10'), { chatId: '-1001234567890', threadId: null });
  assert.equal(linkParaDestino('https://t.me/pakki'), null);
});

test('telegram: token do .env da fábrica ou, se faltar, o do Hermes', () => {
  const home = temp('home-');
  fs.mkdirSync(path.join(home, '.hermes'));
  fs.writeFileSync(path.join(home, '.hermes', '.env'), 'OUTRA=1\nTELEGRAM_BOT_TOKEN="123:abc"\n');
  assert.equal(tokenDoBot({}, home), '123:abc');
  assert.equal(tokenDoBot({ TELEGRAM_BOT_TOKEN: '999:zz' }, home), '999:zz');
  assert.equal(tokenDoBot({}, temp('vazio-')), null);
});

test('telegram: mensagens longas são divididas sem quebrar as tags', () => {
  const longo = Array.from({ length: 400 }, (_, i) => `[ ] Passo ${i} com <texto> & detalhes`).join('\n');
  const blocos = pre(longo);
  assert.ok(blocos.length > 1);
  for (const b of blocos) {
    assert.ok(b.startsWith('<pre>') && b.endsWith('</pre>'));
    assert.ok(!b.slice(5, -6).includes('<pre>'));
    assert.ok(b.includes('&lt;texto&gt; &amp;'));
  }
  const msgs = empacotar(['<b>título</b>', ...blocos, 'fim']);
  assert.ok(msgs.every((m) => m.length <= 3800));
  assert.equal(msgs.join('').split('<pre>').length, msgs.join('').split('</pre>').length);
  assert.equal(esc('a<b>&c'), 'a&lt;b&gt;&amp;c');
});

test('avisos: manda para o grupo e tópico da trilha; sem config ou com erro, não derruba', async () => {
  const raiz = temp('raiz-');
  fs.mkdirSync(path.join(raiz, 'data'));
  fs.writeFileSync(path.join(raiz, 'data', 'telegram.json'), JSON.stringify({
    previdenciario: { grupo: 'Advocacia', roteiro: { chatId: '-100111', threadId: 7 } },
  }));
  const chamadas = [];
  const fetch = async (url, op) => {
    chamadas.push({ url, corpo: JSON.parse(op.body) });
    return { json: async () => ({ ok: true, result: {} }) };
  };
  const logs = [];
  const avisos = criarAvisos({ raiz, env: { TELEGRAM_BOT_TOKEN: '1:x' }, fetch, log: (m) => logs.push(m) });
  assert.equal(await avisos.enviar('previdenciario', 'roteiro', ['<b>oi</b>']), true);
  assert.match(chamadas[0].url, /bot1:x\/sendMessage$/);
  assert.deepEqual(
    { chat: chamadas[0].corpo.chat_id, topico: chamadas[0].corpo.message_thread_id, modo: chamadas[0].corpo.parse_mode },
    { chat: '-100111', topico: 7, modo: 'HTML' },
  );
  assert.equal(await avisos.enviar('previdenciario', 'pautas', ['x']), false); // tópico não ligado
  assert.equal(await avisos.enviar('ia-advogados', 'roteiro', ['x']), false); // trilha não ligada
  assert.equal(chamadas.length, 1);

  const comErro = criarAvisos({ raiz, env: { TELEGRAM_BOT_TOKEN: '1:x' }, fetch: async () => ({ json: async () => ({ ok: false, description: 'chat not found' }) }), log: (m) => logs.push(m) });
  assert.equal(await comErro.enviar('previdenciario', 'roteiro', ['x']), false);
  assert.match(logs.join('\n'), /chat not found/);
});

test('avisos: textos das etapas', async () => {
  const roteiro = JSON.parse(await chamarSimulado('', 'PALAVRAS JÁ USADAS (não repita): nenhuma'));
  const c = { id: 'ig:1', fonte: 'instagram', url: 'https://ig/1', canal: '@a<b>', comentarios: 40000, titulo: 't' };
  const pautas = msgPautas({
    trilha: { nome: 'Prev' }, data: '2026-11-12',
    pautas: [{ numero: 1, candidato: c, classe: { tema: 'Pix & BPC', adaptacao: 'x', classe: 'direto' } }],
    comRoteiroHoje: new Set(['ig:1']),
  }).join('\n');
  assert.match(pautas, /<b>1\.<\/b> ✍️ Pix &amp; BPC/);
  assert.match(pautas, /@a&lt;b&gt;/);
  assert.match(pautas, /40\.000 comentários/);
  assert.match(pautas, /roteiro 4/);

  const r = msgRoteiro({ candidato: c, roteiro }).join('\n');
  assert.match(r, new RegExp(`Comenta ${roteiro.palavra_chave}`));
  assert.match(r, new RegExp(`publica ${roteiro.palavra_chave}`));
  assert.match(r, /Validar antes de gravar/);

  const ed = msgEdicao({ candidato: c, roteiro, ficha: { cortes: [], ritmo: { planos: 1 } }, pedidoEdicao: 'Edite...' });
  assert.match(ed.legenda, /referência/);
  assert.match(ed.blocos.join('\n'), /plano único/);

  const pub = msgPublicacao({ palavra: 'CASA', url: 'https://site/casa/', mensagemDm: 'Oi!', site: 'Advocacia' }).join('\n');
  assert.match(pub, /https:\/\/site\/casa\//);
  assert.match(pub, /correspondência exata/);
});

test('perfis: quem foi tirado pelo Telegram não é lido nem volta quando citado', async () => {
  const ig = criarInstagram({ igUserId: '1', token: 't', pausaMs: 0, fetch: criarFetchSimulado() });
  const memoria = { perfis: { mavgpt: { removido: true } } };
  const r = await ig.minerar({ instagram: { perfis: ['mavgpt', 'outro'], rodadasDeAmpliacao: 1 } }, { memoria });
  assert.ok(r.candidatos.every((c) => c.canal !== '@mavgpt'));
  assert.ok(r.candidatos.some((c) => c.canal === '@outro'));
});

test('etapas: roteiro pedido no Telegram entra no relatório do dia e é achado pela palavra', async () => {
  const raiz = temp('raiz-');
  const base = path.join(raiz, 'data', 'dias', '2026-11-12');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, 'previdenciario.md'), '# relatório\n');
  const roteiro = JSON.parse(await chamarSimulado('', 'PALAVRAS JÁ USADAS (não repita): nenhuma'));
  const item = { candidato: { id: 'yt:1', fonte: 'youtube', url: 'https://y', canal: 'c', views: 10, outlier: 9 }, roteiro, problemas: [] };
  anexarAoDia(base, 'previdenciario', item, 'Pedido no Telegram: pauta 4');
  const achado = acharRoteiro(raiz, roteiro.palavra_chave.toLowerCase());
  assert.equal(achado.trilha, 'previdenciario');
  assert.equal(achado.indice, 0);
  assert.match(fs.readFileSync(path.join(base, 'previdenciario.md'), 'utf8'), /Pedido no Telegram: pauta 4/);
  assert.equal(acharRoteiro(raiz, 'NAOEXISTE'), null);
});

test('instagram: rodízio diário e posts guardados mantêm o levantamento completo', async () => {
  const memoria = { perfis: {} };
  const trilha = { instagram: { perfis: ['a', 'b', 'c', 'd'], maxPerfisPorDia: 2, rodadasDeAmpliacao: 0 } };
  const ig1 = criarInstagram({ igUserId: '1', token: 't', pausaMs: 0, fetch: criarFetchSimulado() });
  const dia1 = await ig1.minerar(trilha, { memoria });
  assert.equal(dia1.perfisLidos, 2);
  assert.equal(dia1.perfisDoCache, 0);
  assert.equal(dia1.perfisSemDados, 2);
  // dia seguinte: lê os 2 que faltaram e usa os posts guardados dos outros 2
  const ig2 = criarInstagram({ igUserId: '1', token: 't', pausaMs: 0, fetch: criarFetchSimulado() });
  const dia2 = await ig2.minerar(trilha, { memoria, agoraData: new Date(Date.now() + 3600000) });
  assert.equal(dia2.perfisLidos, 2);
  assert.equal(dia2.perfisDoCache, 2);
  assert.equal(new Set(dia2.candidatos.map((c) => c.canal)).size, 4);
  assert.ok(memoria.perfis.a.midias.every((m) => !('media_url' in m)));
});

test('instagram: para ao bater o limite da Meta (código 4) ou quando o medidor passa de 80%', async () => {
  const base = criarFetchSimulado();
  let n = 0;
  const fetchComLimite = async (u) => {
    n++;
    if (n > 2) return { ok: false, status: 400, headers: new Map(), json: async () => ({ error: { code: 4, message: 'Application request limit reached' } }) };
    return base(u);
  };
  const logs = [];
  const ig = criarInstagram({ igUserId: '1', token: 't', pausaMs: 0, fetch: fetchComLimite });
  const r = await ig.minerar({ instagram: { perfis: ['a', 'b', 'c'], rodadasDeAmpliacao: 1 } }, { memoria: { perfis: {} }, log: (m) => logs.push(m) });
  assert.equal(r.freado, true);
  assert.equal(r.perfisLidos, 1); // "a" leu 2 páginas; "b" bateu no limite e parou ali
  assert.ok(n <= 3, `fez ${n} chamadas depois do limite`);
  assert.match(logs.join('\n'), /limite da Meta atingido/);

  const medidor = async (u) => {
    const r0 = await base(u);
    return { ...r0, headers: new Map([['x-app-usage', JSON.stringify({ call_count: 10, total_cputime: 85, total_time: 20 })]]) };
  };
  const ig2 = criarInstagram({ igUserId: '1', token: 't', pausaMs: 0, fetch: medidor });
  const r2 = await ig2.minerar({ instagram: { perfis: ['a', 'b'], rodadasDeAmpliacao: 0 } }, { memoria: { perfis: {} } });
  assert.equal(r2.usoMeta, 85);
  assert.equal(r2.freado, true);
  assert.equal(ig2.chamadas(), 1);
});
