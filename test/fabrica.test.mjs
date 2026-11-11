import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediana, duracaoIsoEmSegundos, contarPalavras, hojeSP } from '../src/util.mjs';
import { outlier, ranquear, escolherVariados } from '../src/outlier.mjs';
import { vttParaTexto, legendaYoutube } from '../src/transcrever.mjs';
import { extrairJson, validarRoteiro, montarPedido } from '../src/prompts.mjs';
import { criarYoutube } from '../src/youtube.mjs';
import { criarInstagram, GRAPH_VERSAO } from '../src/instagram.mjs';
import { escreverRoteiro } from '../src/roteiro.mjs';
import { criarFetchSimulado, chamarSimulado, runSimulado, VTT_EXEMPLO } from './simulacao.mjs';

test('mediana e outlier', () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), null);
  assert.equal(outlier(300000, [1000, 2000, 3000]), 150);
  assert.equal(outlier(10, []), null);
  assert.equal(outlier(10, [0, 0]), null);
});

test('duração ISO dos vídeos', () => {
  assert.equal(duracaoIsoEmSegundos('PT17S'), 17);
  assert.equal(duracaoIsoEmSegundos('PT1M5S'), 65);
  assert.equal(duracaoIsoEmSegundos('PT1H'), 3600);
  assert.equal(duracaoIsoEmSegundos('lixo'), null);
});

test('data do dia é a de São Paulo', () => {
  // 01:00 UTC de 12/11 ainda é 11/11 em São Paulo.
  assert.equal(hojeSP(new Date('2026-11-12T01:00:00Z')), '2026-11-11');
});

test('ranquear corta abaixo do mínimo, já usados e repetidos; escolher varia o canal', () => {
  const c = [
    { id: 'a', canal: 'X', metrica: 100, outlier: 10 },
    { id: 'b', canal: 'X', metrica: 100, outlier: 8 },
    { id: 'c', canal: 'Y', metrica: 100, outlier: 2 },
    { id: 'd', canal: 'Z', metrica: 100, outlier: 6 },
    { id: 'a', canal: 'X', metrica: 100, outlier: 10 },
    { id: 'e', canal: 'W', metrica: 100, outlier: 50 },
  ];
  const r = ranquear(c, { minimoOutlier: 5, jaUsados: new Set(['e']) });
  assert.deepEqual(r.map((x) => x.id), ['a', 'b', 'd']);
  assert.deepEqual(escolherVariados(r, 3).map((x) => x.id), ['a', 'd']);
});

test('VTT da legenda automática vira texto sem repetição', () => {
  assert.equal(
    vttParaTexto(VTT_EXEMPLO),
    'Sim. Se o seu marido é aposentado e ganha um salário mínimo, você pode pedir o BPC.',
  );
});

test('legenda do YouTube pelo yt-dlp (simulado)', async () => {
  const r = await legendaYoutube('https://www.youtube.com/shorts/v1', { run: runSimulado });
  assert.match(r.texto, /^Sim\. Se o seu marido/);
  assert.match(r.origem, /pt/);
});

test('YouTube: outlier contra a mediana do canal, sem contar o próprio vídeo', async () => {
  const yt = criarYoutube({ chave: 'x', fetch: criarFetchSimulado() });
  const trilha = { youtube: { buscas: ['BPC'], regionCode: 'BR', janelaDias: [3, 60] } };
  const c = await yt.minerar(trilha);
  const v1 = c.find((x) => x.videoId === 'v1');
  const v2 = c.find((x) => x.videoId === 'v2');
  assert.equal(v1.amostraCanal, 12);
  assert.equal(v1.medianaCanal, 3275);
  assert.ok(v1.outlier > 150 && v1.outlier < 160);
  assert.ok(v2.outlier < 2.1);
  // 1 busca (100) + vídeos + 2 canais (channels + playlistItems + videos cada)
  assert.equal(yt.cota(), 100 + 1 + 2 * 3);
  // cache: minerar de novo não gasta cota com os canais
  await yt.minerar(trilha);
  assert.equal(yt.cota(), 2 * (100 + 1) + 2 * 3);
});

test('YouTube sem chave avisa claramente', () => {
  assert.throws(() => criarYoutube({ chave: '' }), /YOUTUBE_API_KEY/);
});

test('Instagram: Business Discovery com versão fixa, outlier por comentários e janela de datas', async () => {
  const urls = [];
  const f = criarFetchSimulado();
  const ig = criarInstagram({ igUserId: '1', token: 't', fetch: (u) => (urls.push(String(u)), f(u)) });
  const c = await ig.minerar({ instagram: { perfis: ['mavgpt'] }, youtube: { janelaDias: [3, 10] } });
  assert.ok(urls[0].includes(`/${GRAPH_VERSAO}/`));
  assert.ok(!urls[0].includes('latest'));
  // janela 3–10 dias: só os posts de 5 a 10 dias entram (i = 0..5)
  assert.equal(c.length, 6);
  const top = c.sort((a, b) => b.outlier - a.outlier)[0];
  assert.equal(top.comentarios, 40000);
  assert.equal(top.canal, '@mavgpt');
  assert.ok(top.ehVideo);
});

test('extrairJson tolera cerca de código e texto em volta', () => {
  assert.deepEqual(extrairJson('Aqui:\n```json\n{"a":1}\n```\nfim'), { a: 1 });
  assert.throws(() => extrairJson('sem nada'), /sem JSON/);
});

test('validarRoteiro pega palavra repetida, CTA ausente, fala longa e promessa', async () => {
  const ok = JSON.parse(await chamarSimulado('', 'PALAVRAS JÁ USADAS (não repita): nenhuma'));
  assert.deepEqual(validarRoteiro(ok, { palavrasOriginal: 40 }), []);
  assert.ok(validarRoteiro(ok, { palavrasUsadas: [ok.palavra_chave] }).some((p) => /repetida/.test(p)));
  assert.ok(validarRoteiro({ ...ok, fala: 'sem cta' }).some((p) => /CTA/.test(p)));
  assert.ok(validarRoteiro(ok, { palavrasOriginal: 10 }).some((p) => /palavras/.test(p)));
  const prometeu = { ...ok, material: { conteudo: 'Resultado garantido em 30 dias' } };
  assert.ok(validarRoteiro(prometeu).some((p) => /205/.test(p)));
  // falar que NÃO há garantia é permitido
  const honesto = { ...ok, material: { conteudo: 'Nenhuma estrutura dá garantia de resultado.' } };
  assert.deepEqual(validarRoteiro(honesto, { palavrasOriginal: 40 }), []);
  assert.deepEqual(validarRoteiro({ serve: false, motivo: 'fora do tema' }), []);
});

test('escreverRoteiro pede correção uma vez quando a conferência falha', async () => {
  const chamadas = [];
  const chamar = async (s, pedido) => {
    chamadas.push(pedido);
    const r = JSON.parse(await chamarSimulado(s, pedido));
    if (chamadas.length === 1) r.palavra_chave = 'casa minúscula';
    return JSON.stringify(r);
  };
  const trilha = { nome: 'T', publico: 'p', quemPublica: 'q', objetivo: 'o' };
  const candidato = { fonte: 'youtube', url: 'u', canal: 'c', titulo: 't', metrica: 1, metricaNome: 'views', outlier: 9, segundos: 17 };
  const { roteiro, problemas } = await escreverRoteiro({
    trilha, candidato, transcricao: 'uma fala de exemplo com algumas palavras para contar aqui mesmo', palavrasUsadas: [], env: {}, chamar,
  });
  assert.equal(chamadas.length, 2);
  assert.match(chamadas[1], /CORRIJA/);
  assert.match(roteiro.palavra_chave, /^[A-Z]+$/);
  assert.ok(Array.isArray(problemas));
});

test('o pedido leva números, transcrição e palavras já usadas', () => {
  const p = montarPedido({
    trilha: { nome: 'T', publico: 'p', quemPublica: 'q', objetivo: 'o' },
    candidato: { fonte: 'youtube', url: 'u', canal: 'c', titulo: 't', metrica: 510000, metricaNome: 'views', medianaCanal: 3000, outlier: 170, segundos: 17 },
    transcricao: 'um dois três',
    palavrasUsadas: ['CASA'],
  });
  assert.match(p, /510\.000 views/);
  assert.match(p, /170\.0×/);
  assert.match(p, /3 palavras na fala/);
  assert.match(p, /não repita\): CASA/);
  assert.equal(contarPalavras('  um  dois\ntrês '), 3);
});
