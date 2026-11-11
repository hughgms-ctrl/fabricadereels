#!/usr/bin/env node
/**
 * Rotina do dia, para o cron do Termux. Para cada trilha:
 *
 *  INSTAGRAM (métrica principal: COMENTÁRIOS) — o mesmo processo do levantamento de 11/11:
 *   1. perfis grandes da trilha + os descobertos em dias anteriores;
 *   2. amplia com os @ citados nas legendas que tenham +50 mil seguidores (2 rodadas);
 *   3. posts dos últimos 90 dias de todos;
 *   4. só os que passaram do corte de comentários, do maior pro menor;
 *   5. tema em uma linha + classificação (direto / adaptável / não serve);
 *   6. baixa e transcreve os 10 primeiros vídeos que servem.
 *  YOUTUBE (métrica principal: OUTLIER) — Shorts acima de N× a mediana do próprio canal.
 *
 *  Depois: roteiro no formato do Kit + material + DM + ficha de edição da referência
 *  (cortes, ritmo, capa, folha de planos e o pedido pronto para o Claude editar igual).
 *  Salva em data/dias/AAAA-MM-DD/<trilha>.md.
 *
 * Uso:  node bin/rodar-dia.mjs [--trilha id] [--simular] [--sem-roteiro] [--sem-ficha]
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, carregarEnv, lerJson, gravarJson, hojeSP, log } from '../src/util.mjs';
import { criarYoutube } from '../src/youtube.mjs';
import { criarInstagram, selecionarPorComentarios } from '../src/instagram.mjs';
import { ranquear } from '../src/outlier.mjs';
import { transcrever } from '../src/transcrever.mjs';
import { escreverRoteiro, chamarClaude } from '../src/roteiro.mjs';
import { classificar, tabelaLevantamento } from '../src/levantamento.mjs';
import { baixarVideo, montarFicha } from '../src/ficha.mjs';
import { relatorioDoDia, salvarRelatorio } from '../src/saida.mjs';

const args = process.argv.slice(2);
const opc = {
  simular: args.includes('--simular'),
  semRoteiro: args.includes('--sem-roteiro'),
  semFicha: args.includes('--sem-ficha'),
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

    // ---- Instagram: comentários ----
    let listaIG = [];
    let descobertos = [];
    let chamadasIG = 0;
    if (ig && (trilha.instagram?.perfis?.length || Object.keys(memoria.perfis).length || trilha.instagram?.hashtags?.length)) {
      const r = await ig.minerar(trilha, { log, memoria }).catch((e) => (avisos.push(`Instagram: ${e.message}`), null));
      if (r) {
        listaIG = selecionarPorComentarios(r.candidatos, { minimoComentarios: trilha.instagram.minimoComentarios ?? 10000 });
        descobertos = r.descobertosHoje;
        chamadasIG = r.chamadas;
        log(`  Instagram: ${r.perfisLidos} perfis, ${r.candidatos.length} posts em 90 dias, ${listaIG.length} acima de ${trilha.instagram.minimoComentarios} comentários, ${descobertos.length} perfis novos`);
      }
    } else if (ig) {
      avisos.push('Nenhum perfil de Instagram nesta trilha: preencha instagram.perfis em config/trilhas.json.');
    }

    // ---- YouTube: outlier ----
    let listaYT = [];
    if (yt && trilha.youtube?.buscas?.length) {
      const c = await yt.minerar(trilha, { log }).catch((e) => (avisos.push(`YouTube: ${e.message}`), []));
      listaYT = ranquear(c, { minimoOutlier: trilha.youtube.minimoOutlier ?? 5 })
        .filter((v) => v.views >= (trilha.youtube.minimoViews ?? 0));
      log(`  YouTube: ${c.length} Shorts, ${listaYT.length} acima de ${trilha.youtube.minimoOutlier}× a mediana do canal`);
    }

    // ---- Tema em uma linha + classe (uma chamada ao Claude) ----
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

    // ---- Transcrição do top (10 vídeos do Instagram que servem + YouTube escolhidos) ----
    const baixados = new Map();
    const baixar = async (c) => {
      if (baixados.has(c.id)) return baixados.get(c.id);
      const dir = path.join(dirRefs, c.id.replace(/[^a-z0-9]+/gi, '-'));
      const v = await baixarVideo(c, dir, { env, run: deps.run, fetch: deps.fetchVideo });
      baixados.set(c.id, v);
      return v;
    };
    const poolIG = listaIG.filter((c) => c.ehVideo && serve(c) && !jaUsados.has(c.id));
    const poolYT = listaYT.filter((c) => serve(c) && !jaUsados.has(c.id));

    // Um roteiro por assunto: a classificação dá um "grupo" a cada post (ex.: "pix e receita",
    // "perícia social"); se dois virais falam da mesma coisa, entra só o melhor colocado.
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
    const escolhidosIG = variar(poolIG, trilha.roteiros?.instagram ?? 2);
    const escolhidosYT = variar(poolYT, trilha.roteiros?.youtube ?? 1);
    const topIG = poolIG.slice(0, trilha.instagram?.transcreverTop ?? 10);

    const transcricoes = [];
    const paraTranscrever = [...new Map([...escolhidosIG, ...topIG, ...escolhidosYT].map((c) => [c.id, c])).values()];
    for (const c of paraTranscrever) {
      const t = await transcrever(c, env, { raiz: RAIZ, run: deps.run, baixar })
        .catch((e) => {
          log(`    transcrição ${c.canal}: ${e.message}`);
          c.motivoSemTranscricao = e.message;
          return null;
        });
      if (t) {
        c.transcricao = t.texto;
        c.legendaBruta = t.bruta;
        transcricoes.push({ candidato: c, texto: t.texto, origem: t.origem });
      }
    }

    // ---- Roteiros: Instagram por comentários + YouTube por outlier, um por assunto ----
    const escolhidos = [...escolhidosIG, ...escolhidosYT];
    const roteiros = [];
    for (const c of opc.semRoteiro ? [] : escolhidos) {
      log(`  · ${c.canal} · ${c.fonte === 'instagram' ? `${c.comentarios} comentários` : `${c.outlier.toFixed(1)}×`} · ${c.url}`);
      try {
        const k = classes.get(c.id);
        const contexto = k ? { ...c, titulo: `${c.titulo}\nTema: ${k.tema}\nComo adaptar: ${k.adaptacao}` } : c;
        const { roteiro, problemas } = await escreverRoteiro({
          trilha, candidato: contexto, transcricao: c.transcricao || null,
          palavrasUsadas: usados.palavras, env, chamar,
        });
        const item = { candidato: c, classe: k, transcricao: c.transcricao || null, roteiro, problemas };
        if (!opc.semFicha && roteiro.serve !== false && (c.ehVideo || c.fonte === 'youtube')) {
          try {
            const dir = path.join(dirRefs, c.id.replace(/[^a-z0-9]+/gi, '-'));
            if (!baixados.has(c.id)) await baixar(c);
            const ficha = await montarFicha(c, dir, { env, run: deps.run, fetch: deps.fetchVideo, legendaBruta: c.legendaBruta, roteiro });
            item.fichaMd = ficha.markdown.replace(/`(capa\.jpg|planos\.jpg)`/g, (_, a) => `\`${path.relative(base, path.join(dir, a))}\``);
            item.ficha = { info: ficha.info, cortes: ficha.cortes, ritmo: ficha.ritmo };
          } catch (e) {
            item.fichaMd = `> Ficha de edição indisponível: ${e.message}. Abra a referência: ${c.url}\n`;
          }
        }
        roteiros.push(item);
        usados.videos[c.id] = { data, trilha: trilha.id, palavra: roteiro.palavra_chave || null };
        if (roteiro.serve !== false && roteiro.palavra_chave) usados.palavras.push(roteiro.palavra_chave);
        if (problemas.length) log(`    ⚠️ ${problemas.join('; ')}`);
      } catch (e) {
        falhas++;
        log(`    roteiro falhou: ${e.message}`);
      }
    }

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
    // Vídeos baixados só para transcrever (sem ficha) também saem: no relatório fica o link.
    if (env.MANTER_VIDEO !== '1') {
      for (const v of baixados.values()) fs.rmSync(v, { force: true });
    }
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
