#!/usr/bin/env node
/**
 * Escreve o roteiro de uma pauta do mapeamento (o "roteiro 4" do Telegram).
 *   node bin/roteiro.mjs --trilha previdenciario --pauta 4 [--data 2026-11-12]
 * Usa as pautas mais recentes da trilha, acrescenta ao relatório do dia e manda
 * para os tópicos Roteiro e Edição do grupo.
 */
import path from 'node:path';
import { RAIZ, carregarEnv, lerJson, gravarJson, log } from '../src/util.mjs';
import { chamarClaude } from '../src/roteiro.mjs';
import { criarBaixador, garantirTranscricao, produzirRoteiro, lerPautas, anexarAoDia } from '../src/etapas.mjs';
import { criarAvisos, msgRoteiro, msgEdicao } from '../src/avisos.mjs';

const args = process.argv.slice(2);
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
carregarEnv();
const env = process.env;

async function main() {
  const trilhaId = arg('--trilha');
  const numero = Number(arg('--pauta'));
  const { trilhas } = lerJson(path.join(RAIZ, 'config', 'trilhas.json'), { trilhas: [] });
  const trilha = trilhas.find((t) => t.id === trilhaId);
  if (!trilha || !numero) {
    log(`Uso: node bin/roteiro.mjs --trilha <${trilhas.map((t) => t.id).join('|')}> --pauta <número>`);
    process.exit(1);
  }
  const lidas = lerPautas(RAIZ, trilha.id, arg('--data'));
  const pauta = lidas?.pautas.find((p) => p.numero === numero);
  if (!pauta) {
    log(`Não achei a pauta ${numero} de ${trilha.nome}. Pautas de ${lidas?.data || 'nenhum dia'}: 1 a ${lidas?.pautas.length || 0}.`);
    process.exit(1);
  }
  const usados = lerJson(path.join(RAIZ, 'data', 'usados.json'), { videos: {}, palavras: [] });
  const c = pauta.candidato;
  if (usados.videos[c.id]?.palavra) {
    log(`A pauta ${numero} já virou o roteiro ${usados.videos[c.id].palavra}. Para mudar, use: ajusta ${usados.videos[c.id].palavra}: ...`);
    process.exit(1);
  }

  const dirRefs = path.join(lidas.base, `${trilha.id}-referencias`);
  const { baixar, limpar } = criarBaixador({ dirRefs, env });
  log(`▶ ${trilha.nome} · pauta ${numero} · ${c.canal} · ${c.url}`);
  await garantirTranscricao(c, { env, raiz: RAIZ, baixar, log });
  const item = await produzirRoteiro({
    trilha, c, classe: pauta.classe, env, chamar: chamarClaude, usados, dirRefs, base: lidas.base,
    baixar, data: lidas.data,
  });
  limpar();
  gravarJson(path.join(RAIZ, 'data', 'usados.json'), usados);
  anexarAoDia(lidas.base, trilha.id, item, `Pedido no Telegram: pauta ${numero}`);
  log(`✔ Roteiro ${item.roteiro.palavra_chave || '(descartado)'} acrescentado ao relatório de ${lidas.data}`);

  const avisos = criarAvisos({ raiz: RAIZ, env, log });
  await avisos.enviar(trilha.id, 'roteiro', msgRoteiro(item));
  if (item.roteiro.serve !== false) {
    const ed = msgEdicao(item);
    await avisos.enviar(trilha.id, 'edicao', ed.blocos, item.folhaDePlanos, ed.legenda);
  }
}

main().catch((e) => {
  log(`Erro: ${e.message}`);
  process.exitCode = 1;
});
