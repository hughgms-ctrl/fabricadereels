import fs from 'node:fs';
import path from 'node:path';
import { lerJson, gravarJson } from './util.mjs';
import { escreverRoteiro } from './roteiro.mjs';
import { baixarVideo, montarFicha, pedidoDeEdicao } from './ficha.mjs';
import { transcrever } from './transcrever.mjs';
import { roteiroEmMarkdown } from './saida.mjs';

/**
 * Peças de cada etapa, usadas pela rodada diária (bin/rodar-dia.mjs) e pelos comandos
 * que o Hermes chama a partir do Telegram (bin/roteiro.mjs, bin/ajustar.mjs).
 */

export const pastaDoCandidato = (dirRefs, c) => path.join(dirRefs, c.id.replace(/[^a-z0-9]+/gi, '-'));

/** Baixa (uma vez) e devolve o caminho do vídeo de referência. */
export function criarBaixador({ dirRefs, env, deps = {} }) {
  const baixados = new Map();
  const baixar = async (c) => {
    if (baixados.has(c.id)) return baixados.get(c.id);
    const v = await baixarVideo(c, pastaDoCandidato(dirRefs, c), { env, run: deps.run, fetch: deps.fetchVideo });
    baixados.set(c.id, v);
    return v;
  };
  /** O relatório leva só o link: os vídeos saem no fim (MANTER_VIDEO=1 guarda). */
  const limpar = () => {
    if (env.MANTER_VIDEO === '1') return;
    for (const v of baixados.values()) fs.rmSync(v, { force: true });
  };
  return { baixar, limpar, baixados };
}

/** Transcreve se ainda não tiver; guarda texto, legenda com tempos e o motivo de falha. */
export async function garantirTranscricao(c, { env, raiz, deps = {}, baixar, log = () => {} }) {
  if (c.transcricao || c.motivoSemTranscricao) return;
  try {
    const t = await transcrever(c, env, { raiz, run: deps.run, baixar });
    if (t) {
      c.transcricao = t.texto;
      c.legendaBruta = t.bruta;
      c.origemTranscricao = t.origem;
    }
  } catch (e) {
    log(`    transcrição ${c.canal}: ${e.message}`);
    c.motivoSemTranscricao = e.message;
  }
}

/** Roteiro + material + DM + ficha de edição de uma pauta. Atualiza `usados`. */
export async function produzirRoteiro({ trilha, c, classe, env, deps = {}, chamar, usados, dirRefs, base, baixar, semFicha = false, data }) {
  const contexto = classe ? { ...c, titulo: `${c.titulo}\nTema: ${classe.tema}\nComo adaptar: ${classe.adaptacao}` } : c;
  const { roteiro, problemas } = await escreverRoteiro({
    trilha, candidato: contexto, transcricao: c.transcricao || null,
    palavrasUsadas: usados.palavras, env, chamar,
  });
  const item = { candidato: c, classe, transcricao: c.transcricao || null, roteiro, problemas, data };

  if (!semFicha && roteiro.serve !== false && (c.ehVideo || c.fonte === 'youtube')) {
    const dir = pastaDoCandidato(dirRefs, c);
    try {
      await baixar(c);
      const ficha = await montarFicha(c, dir, {
        env: { ...env, MANTER_VIDEO: '1' }, // quem apaga é o baixador, no fim
        run: deps.run, fetch: deps.fetchVideo, legendaBruta: c.legendaBruta, roteiro,
      });
      item.fichaMd = ficha.markdown.replace(/`(capa\.jpg|planos\.jpg)`/g, (_, a) => `\`${path.relative(base, path.join(dir, a))}\``);
      item.ficha = { info: ficha.info, cortes: ficha.cortes, ritmo: ficha.ritmo };
      item.pedidoEdicao = pedidoDeEdicao({ c, info: ficha.info, cortes: ficha.cortes, ritmo: ficha.ritmo, roteiro });
      item.folhaDePlanos = path.join(dir, 'planos.jpg');
    } catch (e) {
      item.fichaErro = e.message;
      item.fichaMd = `> Ficha de edição indisponível: ${e.message}. Abra a referência: ${c.url}\n`;
    }
  }
  usados.videos[c.id] = { data, trilha: trilha.id, palavra: roteiro.palavra_chave || null };
  if (roteiro.serve !== false && roteiro.palavra_chave) usados.palavras.push(roteiro.palavra_chave);
  return item;
}

// ---------- pautas do dia (guardadas para o "roteiro 4" do Telegram) ----------

export function salvarPautas(base, trilhaId, pautas) {
  gravarJson(path.join(base, `${trilhaId}-pautas.json`), { pautas });
}

/** As pautas mais recentes da trilha (do dia pedido ou do último dia que tiver). */
export function lerPautas(raiz, trilhaId, data = null) {
  const dias = path.join(raiz, 'data', 'dias');
  if (!fs.existsSync(dias)) return null;
  const candidatos = data ? [data] : fs.readdirSync(dias).sort().reverse();
  for (const d of candidatos) {
    const arq = path.join(dias, d, `${trilhaId}-pautas.json`);
    if (fs.existsSync(arq)) return { data: d, base: path.join(dias, d), ...lerJson(arq, { pautas: [] }) };
  }
  return null;
}

/** Acrescenta um roteiro ao relatório do dia (.md e .json), sem refazer o resto. */
export function anexarAoDia(base, trilhaId, item, titulo = null) {
  const json = path.join(base, `${trilhaId}.json`);
  const dia = lerJson(json, { trilha: trilhaId, itens: [] });
  dia.itens.push(item);
  gravarJson(json, dia);
  const md = path.join(base, `${trilhaId}.md`);
  const n = dia.itens.length - 1;
  const bloco = `\n---\n\n${titulo ? `> ${titulo}\n\n` : ''}${roteiroEmMarkdown(item, n)}`;
  fs.appendFileSync(md, bloco);
  return md;
}

/** Acha o roteiro mais recente com essa palavra-chave, em qualquer dia e trilha. */
export function acharRoteiro(raiz, palavra) {
  const dias = path.join(raiz, 'data', 'dias');
  if (!fs.existsSync(dias)) return null;
  const alvo = String(palavra).toUpperCase();
  for (const d of fs.readdirSync(dias).sort().reverse()) {
    for (const arq of fs.readdirSync(path.join(dias, d)).filter((a) => a.endsWith('.json') && !a.endsWith('-pautas.json'))) {
      const caminho = path.join(dias, d, arq);
      const j = lerJson(caminho, { itens: [] });
      for (let i = (j.itens || []).length - 1; i >= 0; i--) {
        if (String(j.itens[i].roteiro?.palavra_chave || '').toUpperCase() === alvo) {
          return { data: d, base: path.join(dias, d), arquivo: caminho, trilha: j.trilha, indice: i, item: j.itens[i], dia: j };
        }
      }
    }
  }
  return null;
}
