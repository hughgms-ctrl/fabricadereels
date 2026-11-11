#!/usr/bin/env node
/**
 * Ajusta um roteiro já escrito (o "ajusta CASA: encurta a fala" do Telegram).
 *   node bin/ajustar.mjs CASA "encurta a fala e troca o gancho por uma pergunta"
 * Mantém a palavra-chave, reescreve com o pedido, confere de novo e manda para o tópico Roteiro.
 */
import path from 'node:path';
import { RAIZ, carregarEnv, lerJson, gravarJson, log, contarPalavras } from '../src/util.mjs';
import { chamarClaude } from '../src/roteiro.mjs';
import { SISTEMA, montarPedido, extrairJson, validarRoteiro } from '../src/prompts.mjs';
import { acharRoteiro } from '../src/etapas.mjs';
import { pedidoDeEdicao } from '../src/ficha.mjs';
import { criarAvisos, msgRoteiro } from '../src/avisos.mjs';
import { roteiroEmMarkdown } from '../src/saida.mjs';
import fs from 'node:fs';

carregarEnv();
const env = process.env;

async function main() {
  const [palavra, ...resto] = process.argv.slice(2);
  const pedidoAjuste = resto.join(' ').trim();
  if (!palavra || !pedidoAjuste) {
    log('Uso: node bin/ajustar.mjs PALAVRA "o que mudar"');
    process.exit(1);
  }
  const achado = acharRoteiro(RAIZ, palavra);
  if (!achado) {
    log(`Não achei roteiro com a palavra ${palavra.toUpperCase()}.`);
    process.exit(1);
  }
  const { trilhas } = lerJson(path.join(RAIZ, 'config', 'trilhas.json'), { trilhas: [] });
  const trilha = trilhas.find((t) => t.id === achado.trilha);
  const { item } = achado;
  const usados = lerJson(path.join(RAIZ, 'data', 'usados.json'), { videos: {}, palavras: [] });
  const outras = usados.palavras.filter((p) => p.toUpperCase() !== item.roteiro.palavra_chave.toUpperCase());

  const pedido = `${montarPedido({ trilha, candidato: item.candidato, transcricao: item.transcricao, palavrasUsadas: outras })}

ROTEIRO ATUAL (já aprovado na forma; ajuste só o que o advogado pediu):
${JSON.stringify(item.roteiro)}

AJUSTE PEDIDO PELO ADVOGADO: ${pedidoAjuste}
Mantenha a palavra-chave ${item.roteiro.palavra_chave}. Devolva o JSON completo.`;

  const opcoes = { bin: env.CLAUDE_BIN || 'claude', modelo: env.CLAUDE_MODELO || undefined };
  const novo = extrairJson(await chamarClaude(SISTEMA, pedido, opcoes));
  novo.palavra_chave = item.roteiro.palavra_chave;
  const problemas = validarRoteiro(novo, {
    palavrasUsadas: outras,
    palavrasOriginal: item.transcricao ? contarPalavras(item.transcricao) : null,
  });

  const atualizado = { ...item, roteiro: novo, problemas, ajuste: pedidoAjuste };
  if (item.ficha) {
    atualizado.pedidoEdicao = pedidoDeEdicao({ c: item.candidato, info: item.ficha.info, cortes: item.ficha.cortes, ritmo: item.ficha.ritmo, roteiro: novo });
  }
  achado.dia.itens[achado.indice] = atualizado;
  gravarJson(achado.arquivo, achado.dia);
  fs.appendFileSync(
    path.join(achado.base, `${achado.trilha}.md`),
    `\n---\n\n> Ajuste pedido no Telegram: ${pedidoAjuste}\n\n${roteiroEmMarkdown(atualizado, achado.indice)}`,
  );
  log(`✔ ${novo.palavra_chave} ajustado${problemas.length ? ` (conferência: ${problemas.join('; ')})` : ''}`);

  await criarAvisos({ raiz: RAIZ, env, log }).enviar(achado.trilha, 'roteiro', msgRoteiro(atualizado));
}

main().catch((e) => {
  log(`Erro: ${e.message}`);
  process.exitCode = 1;
});
