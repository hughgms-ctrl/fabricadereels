#!/usr/bin/env node
/**
 * Rotina do dia, para o cron do Termux. Para cada trilha, em etapas:
 *
 *  0. MAPEAMENTO
 *     Instagram (métrica principal: COMENTÁRIOS), o processo do levantamento de 11/11:
 *       perfis grandes + @ citados com 50 mil+ seguidores (2 rodadas), posts de 90 dias,
 *       corte de comentários do maior pro menor.
 *     YouTube (métrica principal: OUTLIER): Shorts acima de N× a mediana do próprio canal.
 *     Classificação: tema em uma linha, assunto, classe, idioma. Transcrição do top 10.
 *  1. PAUTAS   lista numerada do que serve, guardada para o "roteiro 4" do Telegram.
 *  2. ROTEIRO  um por assunto, automático: roteiro + material + DM (formato do Kit).
 *  3. EDIÇÃO   ficha da referência: link, cortes, ritmo, folha de planos e pedido de edição.
 *  (4. PUBLICAÇÃO só com a sua aprovação: bin/aprovar.mjs PALAVRA --publicar)
 *
 *  Tudo vai para data/dias/AAAA-MM-DD/<trilha>.md e, se o Telegram estiver ligado
 *  (13-telegram.bat), para os tópicos do grupo da trilha.
 *
 * Uso:  node bin/rodar-dia.mjs [--trilha id] [--simular] [--sem-roteiro] [--sem-ficha] [--sem-telegram]
 */
import path from 'node:path';
import { RAIZ, carregarEnv, lerJson, gravarJson, hojeSP, log } from '../src/util.mjs';
import { criarYoutube } from '../src/youtube.mjs';
import { criarInstagram, selecionarPorComentarios } from '../src/instagram.mjs';
import { ranquear } from '../src/outlier.mjs';
import { chamarClaude } from '../src/roteiro.mjs';
import { classificar, tabelaLevantamento } from '../src/levantamento.mjs';
import { relatorioDoDia, salvarRelatorio } from '../src/saida.mjs';
import { criarBaixador, garantirTranscricao, produzirRoteiro, salvarPautas } from '../src/etapas.mjs';
import { criarAvisos, msgMapeamento, msgPautas, msgRoteiro, msgEdicao } from '../src/avisos.mjs';

const args = process.argv.slice(2);
const opc = {
  simular: args.includes('--simular'),
  semRoteiro: args.includes('--sem-roteiro'),
  semFicha: args.includes('--sem-ficha'),
  semTelegram: args.includes('--sem-telegram') || args.includes('--simular'),
  trilha: args.includes('--trilha') ? args[args.indexOf('--trilha') + 1] : null,
};

carregarEnv();
const env = process.env;
const DADOS = path.join(RAIZ, 'data');

async function main() {
  const data = hojeSP();
  const { trilhas } = lerJson(path.join(RAIZ, 'config', 'trilhas.json'), { trilhas: [] });
  const usados = lerJson(path.join(DADOS, 'usados.json'), { videos: {}, palavras: [] });
  const cacheCanais = lerJson(path.join(DADOS, 'cache-canais.json'), {});
  const deps = opc.simular ? await dependenciasSimuladas() : {};
  const chamar = deps.chamar || chamarClaude;
  const opcoesClaude = { bin: env.CLAUDE_BIN || 'claude', modelo: env.CLAUDE_MODELO || undefined };
  const base = opc.simular ? path.join(DADOS, 'simulacao', data) : path.join(DADOS, 'dias', data);
  const avisosTg = opc.semTelegram ? null : criarAvisos({ raiz: RAIZ, env, log });

  const yt = env.YOUTUBE_API_KEY || deps.fetch
    ? criarYoutube({ chave: env.YOUTUBE_API_KEY || 'simulada', cacheCanais, fetch: deps.fetch })
    : null;
  const ig = (env.IG_USER_ID && env.IG_ACCESS_TOKEN) || deps.fetch
    ? criarInstagram({ igUserId: env.IG_USER_ID || '1', token: env.IG_ACCESS_TOKEN || 'simulado', fetch: deps.fetch })
    : null;
  const avisosGerais = [];
  if (!yt) avisosGerais.push('YOUTUBE_API_KEY ausente: YouTube pulado.');
  if (!ig) avisosGerais.push('IG_USER_ID / IG_ACCESS_TOKEN ausentes: Instagram pulado.');
  avisosGerais.forEach((a) => log(a));

  let falhas = 0;
  for (const trilha of trilhas.filter((t) => t.ativa && (!opc.trilha || t.id === opc.trilha))) {
    log(`▶ ${trilha.nome}`);
    const avisos = [...avisosGerais];
    const arqMemoria = path.join(DADOS, `memoria-${trilha.id}.json`);
    const memoria = lerJson(arqMemoria, { perfis: {} });
    const dirRefs = path.join(base, `${trilha.id}-referencias`);
    const jaUsados = new Set(Object.keys(usados.videos));
    const enviar = (etapa, blocos, foto, legenda) => (avisosTg ? avisosTg.enviar(trilha.id, etapa, blocos, foto, legenda) : false);

    // ================= 0. MAPEAMENTO =================
    let listaIG = [];
    let descobertos = [];
    let chamadasIG = 0;
    let perfisLidos = 0;
    if (ig && (trilha.instagram?.perfis?.length || Object.keys(memoria.perfis).length || trilha.instagram?.hashtags?.length)) {
      const r = await ig.minerar(trilha, { log, memoria }).catch((e) => (avisos.push(`Instagram: ${e.message}`), null));
      if (r) {
        listaIG = selecionarPorComentarios(r.candidatos, { minimoComentarios: trilha.instagram.minimoComentarios ?? 10000 });
        descobertos = r.descobertosHoje;
        chamadasIG = r.chamadas;
        perfisLidos = r.perfisLidos;
        log(`  Instagram: ${r.perfisLidos} perfis, ${r.candidatos.length} posts em 90 dias, ${listaIG.length} acima de ${trilha.instagram.minimoComentarios} comentários, ${descobertos.length} perfis novos`);
      }
    } else if (ig) {
      avisos.push('Nenhum perfil de Instagram nesta trilha: preencha instagram.perfis em config/trilhas.json.');
    }

    let listaYT = [];
    if (yt && trilha.youtube?.buscas?.length) {
      const c = await yt.minerar(trilha, { log }).catch((e) => (avisos.push(`YouTube: ${e.message}`), []));
      listaYT = ranquear(c, { minimoOutlier: trilha.youtube.minimoOutlier ?? 5 })
        .filter((v) => v.views >= (trilha.youtube.minimoViews ?? 0));
      log(`  YouTube: ${c.length} Shorts, ${listaYT.length} acima de ${trilha.youtube.minimoOutlier}× a mediana do canal`);
    }

    const paraClassificar = [...listaIG.slice(0, 40), ...listaYT.slice(0, 20)];
    let classes = new Map();
    if (!opc.semRoteiro && paraClassificar.length) {
      classes = await classificar(trilha, paraClassificar, { chamar, opcoes: opcoesClaude })
        .catch((e) => (avisos.push(`Classificação: ${e.message}`), new Map()));
    }
    const idiomas = trilha.idiomasAceitos;
    const serve = (c) => {
      const k = classes.get(c.id);
      if (!k) return opc.semRoteiro || !classes.size; // sem classificação: não descarta
      if (k.classe === 'nao_serve') return false;
      return !idiomas?.length || !k.idioma || idiomas.includes(k.idioma);
    };
    const poolIG = listaIG.filter((c) => c.ehVideo && serve(c) && !jaUsados.has(c.id));
    const poolYT = listaYT.filter((c) => serve(c) && !jaUsados.has(c.id));

    // ================= 1. PAUTAS =================
    // Numeradas na ordem da métrica: Instagram por comentários, depois YouTube por outlier.
    const pautas = [...poolIG, ...poolYT].map((c, i) => ({ numero: i + 1, candidato: c, classe: classes.get(c.id) || null }));

    // Um roteiro por assunto: se dois virais falam da mesma coisa, entra só o melhor colocado.
    const gruposUsados = new Set();
    const variar = (lista, n) => {
      const out = [];
      for (const c of lista) {
        if (out.length >= n) break;
        const g = String(classes.get(c.id)?.grupo || c.id).toLowerCase().trim();
        if (gruposUsados.has(g)) continue;
        gruposUsados.add(g);
        out.push(c);
      }
      return out;
    };
    const escolhidos = opc.semRoteiro ? [] : [
      ...variar(poolIG, trilha.roteiros?.instagram ?? 2),
      ...variar(poolYT, trilha.roteiros?.youtube ?? 1),
    ];

    // Transcrição: os escolhidos + o top 10 do Instagram (vai no relatório para leitura).
    const { baixar, limpar } = criarBaixador({ dirRefs, env, deps });
    const transcricoes = [];
    const paraTranscrever = [...new Map([...escolhidos, ...poolIG.slice(0, trilha.instagram?.transcreverTop ?? 10)].map((c) => [c.id, c])).values()];
    for (const c of paraTranscrever) {
      await garantirTranscricao(c, { env, raiz: RAIZ, deps, baixar, log });
      if (c.transcricao) transcricoes.push({ candidato: c, texto: c.transcricao, origem: c.origemTranscricao });
    }
    if (!opc.simular) salvarPautas(base, trilha.id, pautas);

    await enviar('mapeamento', msgMapeamento({
      trilha, data, perfisLidos, descobertos, listaIG, listaYT, servem: pautas.length, avisos,
    }));
    await enviar('pautas', msgPautas({ trilha, data, pautas: pautas.slice(0, 15), comRoteiroHoje: new Set(escolhidos.map((c) => c.id)) }));

    // ================= 2. ROTEIRO + 3. EDIÇÃO =================
    const roteiros = [];
    for (const c of escolhidos) {
      log(`  · ${c.canal} · ${c.fonte === 'instagram' ? `${c.comentarios} comentários` : `${c.outlier.toFixed(1)}×`} · ${c.url}`);
      try {
        const item = await produzirRoteiro({
          trilha, c, classe: classes.get(c.id) || null, env, deps, chamar, usados, dirRefs, base,
          baixar, semFicha: opc.semFicha, data,
        });
        roteiros.push(item);
        if (item.problemas.length) log(`    ⚠️ ${item.problemas.join('; ')}`);
        if (item.roteiro.serve !== false) {
          await enviar('roteiro', msgRoteiro(item));
          const ed = msgEdicao(item);
          await enviar('edicao', ed.blocos, item.folhaDePlanos, ed.legenda);
        }
      } catch (e) {
        falhas++;
        log(`    roteiro falhou: ${e.message}`);
      }
    }
    limpar();

    const tabelaIG = listaIG.length || ig
      ? tabelaLevantamento(listaIG.slice(0, 40), classes, {
          titulo: `Levantamento do Instagram · ${trilha.instagram?.minimoComentarios?.toLocaleString('pt-BR')}+ comentários em 90 dias`,
          linhaMetrica: 'Ordenado por comentários, do maior para o menor. Outlier = comentários ÷ mediana do próprio perfil.',
        })
      : '';
    const tabelaYT = listaYT.length
      ? tabelaLevantamento(listaYT.slice(0, 20).map((v) => ({ ...v, canal: `${v.canal} (${Math.round(v.views).toLocaleString('pt-BR')} views)` })), classes, {
          titulo: `Levantamento do YouTube · outlier ${trilha.youtube.minimoOutlier}× ou mais`,
          linhaMetrica: 'Ordenado por outlier (views ÷ mediana dos Shorts recentes do canal).',
        })
      : '';
    const md = salvarRelatorio(base, trilha.id, relatorioDoDia({
      data, trilha, tabelaIG, tabelaYT, roteiros, transcricoes, descobertos, avisos, cota: yt?.cota(), chamadasIG,
    }), { data, trilha: trilha.id, itens: roteiros });
    log(`  ✔ ${path.relative(RAIZ, md)}`);
    if (!opc.simular) gravarJson(arqMemoria, memoria);
  }

  if (!opc.simular) {
    gravarJson(path.join(DADOS, 'usados.json'), usados);
    gravarJson(path.join(DADOS, 'cache-canais.json'), cacheCanais);
  }
  process.exitCode = falhas ? 1 : 0;
}

/** --simular: o caminho inteiro com dados de exemplo, sem rede e sem gastar nada. */
async function dependenciasSimuladas() {
  const s = await import('../test/simulacao.mjs');
  process.env.WHISPER_MODELO = s.prepararWhisperSimulado();
  process.env.TRANSCRICAO_REELS = 'whisper';
  return { fetch: s.criarFetchSimulado(), chamar: s.chamarSimulado, run: s.runSimulado, fetchVideo: s.fetchVideoSimulado };
}

main().catch((e) => {
  log(`Erro: ${e.message}`);
  process.exitCode = 1;
});
