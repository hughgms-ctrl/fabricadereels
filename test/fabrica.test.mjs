import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediana, duracaoIsoEmSegundos, contarPalavras, hojeSP } from '../src/util.mjs';
import { outlier, ranquear, escolherVariados } from '../src/outlier.mjs';
import { vttParaTexto, legendaYoutube, transcrever } from '../src/transcrever.mjs';
import { extrairJson, validarRoteiro, montarPedido } from '../src/prompts.mjs';
import { criarYoutube } from '../src/youtube.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { criarInstagram, GRAPH_VERSAO, selecionarPorComentarios, arrobas } from '../src/instagram.mjs';
import { escreverRoteiro } from '../src/roteiro.mjs';
import { lerTemposDeCorte, trechosComTempo, resumoRitmo, pedidoDeEdicao, montarFicha } from '../src/ficha.mjs';
import { classificar, tabelaLevantamento } from '../src/levantamento.mjs';
import { materialEmHtml, slug, gerarSites } from '../src/sites.mjs';
import { criarFetchSimulado, chamarSimulado, runSimulado, fetchVideoSimulado, VTT_EXEMPLO } from './simulacao.mjs';

function temFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

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

test('Instagram: processo do levantamento (90 dias paginados + ampliação por @ citados com 50 mil+)', async () => {
  const urls = [];
  const f = criarFetchSimulado();
  const ig = criarInstagram({ igUserId: '1', token: 't', fetch: (u) => (urls.push(decodeURIComponent(String(u))), f(u)) });
  const memoria = { perfis: {} };
  const r = await ig.minerar(
    { instagram: { perfis: ['@MavGPT'], janelaDias: 90, minimoSeguidores: 50000, rodadasDeAmpliacao: 2 } },
    { memoria },
  );
  assert.ok(urls.every((u) => u.includes(`/${GRAPH_VERSAO}/`) && !u.includes('latest')));
  // 60 posts, 1 a cada 1,5 dia a partir de 2 dias: 59 dentro de 90 dias; precisou da 2ª página.
  assert.ok(urls.some((u) => u.includes('.after(50)')));
  // @parceiro_grande (300 mil) entrou; @parceiro_pequeno (2 mil) não.
  assert.deepEqual(r.descobertosHoje.map((d) => d.username), ['parceiro_grande']);
  assert.ok(memoria.perfis.parceiro_grande);
  assert.ok(!memoria.perfis.parceiro_pequeno);
  assert.equal(r.candidatos.length, 59 * 2);
  assert.equal(r.chamadas, 2 + 1 + 2 + 1);
});

test('Instagram: comentário é a métrica principal (corte absoluto, maior pro menor)', async () => {
  const ig = criarInstagram({ igUserId: '1', token: 't', fetch: criarFetchSimulado() });
  const r = await ig.minerar({ instagram: { perfis: ['a', 'b'], rodadasDeAmpliacao: 0 } }, { memoria: { perfis: {} } });
  const lista = selecionarPorComentarios(r.candidatos, { minimoComentarios: 10000 });
  assert.deepEqual(lista.map((c) => c.comentarios), [40000, 40000, 12000, 12000]);
  assert.ok(lista[0].outlier > 50); // outlier vai junto, como informação
  const semUsados = selecionarPorComentarios(r.candidatos, { minimoComentarios: 10000, jaUsados: new Set([lista[0].id]) });
  assert.equal(semUsados.length, 3);
  assert.equal(selecionarPorComentarios(r.candidatos, { minimoComentarios: 10000, soVideo: true }).length, 2);
});

test('@ citados ignoram e-mail e pontuação no fim', () => {
  assert.deepEqual(arrobas('fale com a@b.com e @Joao.Silva. Parceria com @marca_x!'), ['joao.silva', 'marca_x']);
});

test('ficha: cortes, fala com tempos, ritmo e pedido de edição', () => {
  assert.deepEqual(lerTemposDeCorte('frame:0 pts:60 pts_time:2\nlavfi.scene_score=0.9\nframe:1 pts:135 pts_time:4.5333\n'), [2, 4.53]);
  const srt = trechosComTempo('1\n00:00:00,000 --> 00:00:02,500\nPrimeira frase.\n\n2\n00:00:02,500 --> 00:00:05,000\nSegunda.\n');
  assert.deepEqual(srt, [{ ini: 0, fim: 2.5, texto: 'Primeira frase.' }, { ini: 2.5, fim: 5, texto: 'Segunda.' }]);
  const vtt = trechosComTempo(VTT_EXEMPLO);
  assert.equal(vtt[0].texto, 'Sim. Se o seu marido é aposentado');
  assert.equal(vtt.length, 2);
  const ritmo = resumoRitmo({ segundos: 6.5, cortes: [2, 4.5] });
  assert.deepEqual(ritmo, { planos: 3, cortesPorSegundo: 0.31, planoMedio: 2.2, gancho: 2 });
  const pedido = pedidoDeEdicao({
    c: { url: 'https://ref' }, info: { largura: 1080, altura: 1920, segundos: 6.5 }, cortes: [2, 4.5], ritmo,
    roteiro: { frame0: 'PODE?', texto_tela: ['SIM'], palavra_chave: 'CASA' },
  });
  assert.match(pedido, /https:\/\/ref/);
  assert.match(pedido, /primeiro corte em 2\.0s/);
  assert.match(pedido, /COMENTA CASA/);
});

test('ficha: corte seco junta detecções próximas; plano único vira instrução de câmera parada', () => {
  // dois quadros seguidos no mesmo corte + um quadro inicial: vira um corte só
  assert.deepEqual(lerTemposDeCorte('pts_time:0.03\npts_time:2\npts_time:2.03\npts_time:2.06\npts_time:4\n'), [2, 4]);
  const unico = pedidoDeEdicao({
    c: { url: 'https://ref' }, info: { largura: 2160, altura: 3840, segundos: 27.9 }, cortes: [],
    ritmo: resumoRitmo({ segundos: 27.9, cortes: [] }), roteiro: {},
  });
  assert.match(unico, /plano único/);
  assert.match(unico, /1080x1920 \(9:16\)/);
  assert.doesNotMatch(unico, /primeiro corte/);
  assert.doesNotMatch(unico, /2160x3840/);
});

test('transcrição: o motivo da falha aparece (legenda do YouTube e Whisper ausente)', async () => {
  const run = async (bin) => {
    if (bin === 'yt-dlp') throw new Error('WARNING: x\nERROR: [youtube] abc: Sign in to confirm you’re not a bot');
    return '';
  };
  await assert.rejects(
    transcrever({ fonte: 'youtube', url: 'https://y' }, { TRANSCRICAO_REELS: 'whisper', WHISPER_MODELO: '/nao/existe.bin' }, { run, baixar: async () => '/tmp/v.mp4' }),
    /legenda do YouTube: \[youtube\] abc: Sign in to confirm.*Whisper não instalado/,
  );
});

test('ficha de ponta a ponta com ffmpeg de verdade', { skip: !temFfmpeg() }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ficha-teste-'));
  const r = await montarFicha({ fonte: 'instagram', url: 'https://ref', midiaUrl: 'https://video', canal: '@x', comentarios: 12000 }, dir, {
    env: {}, run: runSimulado, fetch: fetchVideoSimulado, legendaBruta: VTT_EXEMPLO, roteiro: { palavra_chave: 'CASA' },
  });
  assert.deepEqual(r.cortes, [2, 4.53]);
  assert.equal(r.info.largura, 360);
  assert.ok(fs.statSync(path.join(dir, 'planos.jpg')).size > 0);
  assert.ok(fs.statSync(path.join(dir, 'capa.jpg')).size > 0);
  assert.match(r.markdown, /Fala com tempos/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('levantamento: tema e classe numa chamada, tabela com link e classe', async () => {
  const lista = [
    { id: 'ig:1', canal: '@a', comentarios: 40000, outlier: 100, url: 'https://ig/1', descricao: 'Comment PROMPT', titulo: 'x' },
    { id: 'ig:2', canal: '@b', comentarios: 12000, outlier: 30, url: 'https://ig/2', descricao: 'My new course', titulo: 'y' },
  ];
  const classes = await classificar({ nome: 'T', publico: 'p', objetivo: 'o' }, lista, { chamar: chamarSimulado });
  assert.equal(classes.get('ig:1').classe, 'adaptavel');
  assert.equal(classes.get('ig:2').classe, 'nao_serve');
  const t = tabelaLevantamento(lista, classes, { titulo: 'Levantamento', linhaMetrica: '' });
  assert.match(t, /\| 1 \| @a \| 40\.000 \| 100\.0× \| \[abrir\]\(https:\/\/ig\/1\)/);
  assert.match(t, /✅ adaptável/);
  assert.match(t, /❌ não serve/);
  assert.match(t, /🔁/);
});

test('sites: material vira página com caixas, seções e campos; HTML escapado', () => {
  const html = materialEmHtml('PASSO 1 — QUEM ENTRA\n\n  [ ] Cônjuge <b>\n➜ ANOTE: total _____\nRenda ....... R$ _____\n⚠️ Cuidado\ntexto normal');
  assert.match(html, /<h2>PASSO 1 — QUEM ENTRA<\/h2>/);
  assert.match(html, /type="checkbox"[^>]*><span>Cônjuge &lt;b&gt;<\/span>/);
  assert.match(html, /class="anote"/);
  assert.match(html, /class="campo"><span>Renda<\/span><span class="preencher">R\$<\/span>/);
  assert.match(html, /class="alerta"/);
  assert.doesNotMatch(html, /<b>/);
  assert.equal(slug('Ação Já'), 'acao-ja');
});

test('sites: gera um site por pasta, com a página de cada material aprovado', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sites-'));
  fs.mkdirSync(path.join(raiz, 'conteudo', 'adv'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'conteudo', 'adv', 'casa.json'), JSON.stringify({ palavra: 'CASA', nome: 'Teste <da> Casa', conteudo: '[ ] a', aprovadoEm: '2026-11-11' }));
  const cfg = { sites: [{ id: 'adv', trilhas: [], titulo: 'T', descricao: 'D', assinatura: 'A', aviso: 'Aviso', cores: { fundo: '#fff', superficie: '#fff', texto: '#000', suave: '#555', linha: '#ddd', destaque: '#123', destaqueSuave: '#eee' }, webhookLead: 'https://hook' }] };
  const gerados = gerarSites(raiz, cfg).map((f) => path.relative(raiz, f));
  assert.deepEqual(gerados, ['sites/adv/index.html', 'sites/adv/casa/index.html']);
  const pagina = fs.readFileSync(path.join(raiz, 'sites/adv/casa/index.html'), 'utf8');
  assert.match(pagina, /Teste &lt;da&gt; Casa/);
  assert.match(pagina, /id="form"/); // com webhook, o material abre depois do formulário
  assert.match(pagina, /"https:\/\/hook"/);
  fs.rmSync(raiz, { recursive: true, force: true });
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
