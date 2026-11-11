#!/usr/bin/env node
/**
 * Escreve o roteiro das pautas que o Hugo escolheu no Telegram ("roteiro 4", "roteiro 2, 5, 7").
 *   node bin/roteiro.mjs --trilha previdenciario --pauta 4
 *   node bin/roteiro.mjs --trilha ia-advogados --pauta 2,5,7 [--data 2026-11-12]
 * Usa as pautas mais recentes da trilha, uma de cada vez: transcreve a referência (Whisper),
 * escreve com o Claude, monta a ficha de edição, acrescenta ao relatório do dia e manda
 * para os tópicos Roteiro e Edição do grupo.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RAIZ, carregarEnv, lerJson, gravarJson, log } from '../src/util.mjs';
import { chamarClaude } from '../src/roteiro.mjs';
import { criarBaixador, garantirTranscricao, produzirRoteiro, lerPautas, anexarAoDia } from '../src/etapas.mjs';
import { criarAvisos, msgRoteiro, msgEdicao } from '../src/avisos.mjs';

const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
carregarEnv();
const env = process.env;

/** "4", "2,5,7", "2 5 7", "2, 5 e 7" → [2, 5, 7] */
export function lerNumeros(texto) {
  return [...new Set(String(texto || '').split(/[^\d]+/).filter(Boolean).map(Number).filter((n) => n > 0))];
}

async function main() {
  const trilhaId = arg('--trilha');
  const numeros = lerNumeros(arg('--pauta'));
  const { trilhas } = lerJson(path.join(RAIZ, 'config', 'trilhas.json'), { trilhas: [] });
  const trilha = trilhas.find((t) => t.id === trilhaId);
  if (!trilha || !numeros.length) {
    log(`Uso: node bin/roteiro.mjs --trilha <${trilhas.map((t) => t.id).join('|')}> --pauta <número ou lista: 2,5,7>`);
    process.exit(1);
  }
  const lidas = lerPautas(RAIZ, trilha.id, arg('--data'));
  if (!lidas) {
    log(`Ainda não há pautas de ${trilha.nome}. O mapeamento roda às 06:17 (ou "roda o mapeamento agora").`);
    process.exit(1);
  }
  const avisos = criarAvisos({ raiz: RAIZ, env, log });
  const dirRefs = path.join(lidas.base, `${trilha.id}-referencias`);
  const { baixar, limpar } = criarBaixador({ dirRefs, env });
  let falhas = 0;

  for (const numero of numeros) {
    const pauta = lidas.pautas.find((p) => p.numero === numero);
    if (!pauta) {
      log(`Não achei a pauta ${numero}. Pautas de ${lidas.data}: 1 a ${lidas.pautas.length}.`);
      falhas++;
      continue;
    }
    // Relê a cada pauta: outra pauta desta mesma lista pode ter usado palavras novas.
    const usados = lerJson(path.join(RAIZ, 'data', 'usados.json'), { videos: {}, palavras: [] });
    const c = pauta.candidato;
    if (usados.videos[c.id]?.palavra) {
      log(`A pauta ${numero} já virou o roteiro ${usados.videos[c.id].palavra}. Para mudar: ajusta ${usados.videos[c.id].palavra}: ...`);
      continue;
    }
    try {
      log(`▶ ${trilha.nome} · pauta ${numero} · ${c.canal} · ${c.url}`);
      c.idioma ??= pauta.classe?.idioma || trilha.idiomasAceitos?.[0] || null;
      log('  🎙️ transcrevendo a referência (no celular pode levar alguns minutos)');
      await garantirTranscricao(c, { env, raiz: RAIZ, baixar, log });
      log('  ✍️ escrevendo o roteiro');
      const item = await produzirRoteiro({
        trilha, c, classe: pauta.classe, env, chamar: chamarClaude, usados, dirRefs, base: lidas.base,
        baixar, data: lidas.data,
      });
      gravarJson(path.join(RAIZ, 'data', 'usados.json'), usados);
      anexarAoDia(lidas.base, trilha.id, item, `Pedido no Telegram: pauta ${numero}`);
      log(`✔ Pauta ${numero} → roteiro ${item.roteiro.palavra_chave || '(descartado)'}`);
      await avisos.enviar(trilha.id, 'roteiro', msgRoteiro(item));
      if (item.roteiro.serve !== false) {
        const ed = msgEdicao(item);
        await avisos.enviar(trilha.id, 'edicao', ed.blocos, item.folhaDePlanos, ed.legenda);
      }
    } catch (e) {
      falhas++;
      log(`✖ Pauta ${numero}: ${e.message}`);
    }
  }
  limpar();
  process.exitCode = falhas ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    log(`Erro: ${e.message}`);
    process.exitCode = 1;
  });
}
