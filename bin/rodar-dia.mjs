#!/usr/bin/env node
/**
 * Rotina do dia, para o cron do Termux:
 *   1. minera cada trilha (YouTube + Instagram, APIs grátis)
 *   2. ranqueia por outlier e escolhe os N melhores ainda não usados
 *   3. transcreve (legenda do YouTube; Whisper local para reels)
 *   4. escreve roteiro + material + DM no formato do Kit (Claude Code)
 *   5. salva em data/dias/AAAA-MM-DD/<trilha>.md e marca como usado
 *
 * Uso:  node bin/rodar-dia.mjs [--trilha id] [--simular] [--sem-roteiro]
 */
import path from 'node:path';
import { RAIZ, carregarEnv, lerJson, gravarJson, hojeSP, log } from '../src/util.mjs';
import { criarYoutube } from '../src/youtube.mjs';
import { criarInstagram } from '../src/instagram.mjs';
import { ranquear, escolherVariados } from '../src/outlier.mjs';
import { transcrever } from '../src/transcrever.mjs';
import { escreverRoteiro } from '../src/roteiro.mjs';
import { salvarDia } from '../src/saida.mjs';

const args = process.argv.slice(2);
const opc = {
  simular: args.includes('--simular'),
  semRoteiro: args.includes('--sem-roteiro'),
  trilha: args.includes('--trilha') ? args[args.indexOf('--trilha') + 1] : null,
};

carregarEnv();
const env = process.env;
const ARQ = {
  trilhas: path.join(RAIZ, 'config', 'trilhas.json'),
  usados: path.join(RAIZ, 'data', 'usados.json'),
  canais: path.join(RAIZ, 'data', 'cache-canais.json'),
};

async function main() {
  const data = hojeSP();
  const { trilhas } = lerJson(ARQ.trilhas, { trilhas: [] });
  const usados = lerJson(ARQ.usados, { videos: {}, palavras: [] });
  const cacheCanais = lerJson(ARQ.canais, {});
  const deps = opc.simular ? await dependenciasSimuladas() : {};

  const yt = env.YOUTUBE_API_KEY || deps.fetch
    ? criarYoutube({ chave: env.YOUTUBE_API_KEY || 'simulada', cacheCanais, fetch: deps.fetch })
    : null;
  const ig = (env.IG_USER_ID && env.IG_ACCESS_TOKEN) || deps.fetch
    ? criarInstagram({ igUserId: env.IG_USER_ID || '1', token: env.IG_ACCESS_TOKEN || 'simulado', fetch: deps.fetch })
    : null;
  if (!yt) log('YOUTUBE_API_KEY ausente: pulando o YouTube.');
  if (!ig) log('IG_USER_ID / IG_ACCESS_TOKEN ausentes: pulando o Instagram.');

  let falhas = 0;
  for (const trilha of trilhas.filter((t) => t.ativa && (!opc.trilha || t.id === opc.trilha))) {
    log(`▶ ${trilha.nome}`);
    const candidatos = [];
    if (yt) candidatos.push(...(await yt.minerar(trilha, { log }).catch((e) => (log(`  YouTube: ${e.message}`), []))));
    if (ig && trilha.instagram?.perfis?.length) {
      candidatos.push(...(await ig.minerar(trilha, { log }).catch((e) => (log(`  Instagram: ${e.message}`), []))));
    }
    const ranqueados = ranquear(
      candidatos.map((c) => ({ ...c, metrica: c.metrica ?? 0 })),
      {
        minimoOutlier: trilha.minimoOutlier,
        minimoMetrica: 0,
        jaUsados: new Set(Object.keys(usados.videos)),
      },
    ).filter((c) => c.fonte !== 'youtube' || c.views >= (trilha.minimoViews || 0));
    const escolhidos = escolherVariados(ranqueados, trilha.porDia || 3);
    log(`  ${candidatos.length} candidatos, ${ranqueados.length} acima do corte, ${escolhidos.length} escolhidos`);

    const itens = [];
    for (const c of escolhidos) {
      log(`  · ${c.canal} · ${c.outlier.toFixed(1)}× · ${c.url}`);
      const t = await transcrever(c, env, { raiz: RAIZ, run: deps.run }).catch((e) => (log(`    transcrição: ${e.message}`), null));
      if (opc.semRoteiro) {
        itens.push({ candidato: c, transcricao: t?.texto || null, roteiro: { serve: false, motivo: 'rodado com --sem-roteiro' } });
        continue;
      }
      try {
        const { roteiro, problemas } = await escreverRoteiro({
          trilha, candidato: c, transcricao: t?.texto || null,
          palavrasUsadas: usados.palavras, env, chamar: deps.chamar,
        });
        itens.push({ candidato: c, transcricao: t?.texto || null, origemTranscricao: t?.origem || null, roteiro, problemas });
        usados.videos[c.id] = { data, trilha: trilha.id, palavra: roteiro.palavra_chave || null };
        if (roteiro.serve !== false && roteiro.palavra_chave) usados.palavras.push(roteiro.palavra_chave);
        if (problemas.length) log(`    ⚠️ ${problemas.join('; ')}`);
      } catch (e) {
        falhas++;
        log(`    roteiro falhou: ${e.message}`);
      }
    }
    const base = opc.simular ? path.join(RAIZ, 'data', 'simulacao') : path.join(RAIZ, 'data', 'dias');
    const arq = salvarDia(base, { data, trilha, itens, cota: yt?.cota() });
    log(`  ✔ ${path.relative(RAIZ, arq)}`);
  }

  if (!opc.simular) {
    gravarJson(ARQ.usados, usados);
    gravarJson(ARQ.canais, cacheCanais);
  }
  if (yt) log(`Cota do YouTube usada hoje nesta rodada: ${yt.cota()} de 10.000`);
  process.exitCode = falhas ? 1 : 0;
}

/** --simular: roda o caminho inteiro com dados de exemplo, sem rede e sem gastar nada. */
async function dependenciasSimuladas() {
  const { criarFetchSimulado, chamarSimulado, runSimulado } = await import('../test/simulacao.mjs');
  return { fetch: criarFetchSimulado(), chamar: chamarSimulado, run: runSimulado };
}

main().catch((e) => {
  log(`Erro: ${e.message}`);
  process.exitCode = 1;
});
