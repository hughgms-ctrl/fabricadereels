import fs from 'node:fs';
import path from 'node:path';
import { contarPalavras } from './util.mjs';

const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('pt-BR') : '?');

/** Um bloco de roteiro no formato do Kit, em Markdown (abre bem no celular). */
export function roteiroEmMarkdown(item, i) {
  const { candidato: c, roteiro: r, transcricao, problemas = [] } = item;
  const cab = `## ${String(i + 1).padStart(2, '0')} · ${r.serve === false ? 'descartado' : r.palavra_chave}`;
  const ref = `**Referência:** [${c.canal}](${c.url}) · ${fmt(c.metrica)} ${c.metricaNome} · outlier **${c.outlier?.toFixed(1)}×** (mediana do autor ${fmt(c.medianaCanal)})`;
  if (r.serve === false) return `${cab}\n\n${ref}\n\n> Não serve para a trilha: ${r.motivo}\n`;

  const palavras = contarPalavras(r.fala);
  const linhas = [
    cab,
    '',
    ref,
    '',
    `**Por que viralizou:** ${r.por_que_viralizou}`,
    '',
    `**Forma do original:** ${r.forma_original} (${r.palavras_original} palavras${c.segundos ? ` em ${c.segundos}s` : ''})`,
    '',
    `**Frame 0 (na tela):** \`${r.frame0}\``,
    '',
    '**Fala:**',
    '',
    `> ${r.fala}`,
    '',
    `_${palavras} palavras · ~${Math.round(palavras / 2.7)}s_`,
    '',
    `**Texto na tela:** ${(r.texto_tela || []).map((t) => `\`${t}\``).join(' → ')}`,
    '',
  ];
  if (r.validar?.length) {
    linhas.push('**Validar antes de gravar:**', '');
    for (const v of r.validar) linhas.push(`- [ ] ${v.ponto} _(${v.confianca}; ${v.origem})_`);
    linhas.push('');
  }
  if (problemas.length) {
    linhas.push('> ⚠️ Conferência automática:', ...problemas.map((p) => `> - ${p}`), '');
  }
  linhas.push(
    `### Material: ${r.material?.nome}`,
    '',
    r.material?.subtitulo ? `_${r.material.subtitulo}_\n` : '',
    '```',
    r.material?.conteudo || '',
    '```',
    '',
    '### Mensagem de entrega (DM)',
    '',
    '```',
    r.mensagem_dm || '',
    '```',
    '',
    `<details><summary>Transcrição do original</summary>\n\n${transcricao || '(sem transcrição)'}\n\n</details>`,
    '',
  );
  return linhas.join('\n');
}

export function diaEmMarkdown({ data, trilha, itens, cota }) {
  const uteis = itens.filter((i) => i.roteiro?.serve !== false);
  return [
    `# ${trilha.nome} · ${data}`,
    '',
    `${uteis.length} roteiro(s) prontos de ${itens.length} viral(is) analisados.${cota ? ` Cota do YouTube usada: ${cota} de 10.000.` : ''}`,
    '',
    'Palavras-chave para cadastrar no Pakki Engage (**correspondência exata**, nunca "contém"): ' +
      (uteis.map((i) => `**${i.roteiro.palavra_chave}**`).join(', ') || 'nenhuma'),
    '',
    ...itens.map((it, i) => roteiroEmMarkdown(it, i)),
  ].join('\n');
}

export function salvarDia(base, { data, trilha, itens, cota }) {
  const dir = path.join(base, data);
  fs.mkdirSync(dir, { recursive: true });
  const md = path.join(dir, `${trilha.id}.md`);
  fs.writeFileSync(md, diaEmMarkdown({ data, trilha, itens, cota }));
  fs.writeFileSync(path.join(dir, `${trilha.id}.json`), JSON.stringify({ data, trilha: trilha.id, itens }, null, 2));
  return md;
}
