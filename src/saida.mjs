import fs from 'node:fs';
import path from 'node:path';
import { contarPalavras } from './util.mjs';

const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('pt-BR') : '?');

/** Um roteiro no formato do Kit, com a ficha de edição da referência logo abaixo. */
export function roteiroEmMarkdown(item, i) {
  const { candidato: c, roteiro: r, transcricao, problemas = [], fichaMd, classe } = item;
  const cab = `## ${String(i + 1).padStart(2, '0')} · ${r.serve === false ? 'descartado' : `Comenta ${r.palavra_chave}`}`;
  const numeros = c.fonte === 'instagram'
    ? `**${fmt(c.comentarios)} comentários**${c.views ? ` · ${fmt(c.views)} views` : ''}${c.outlier ? ` · outlier ${c.outlier.toFixed(1)}×` : ''}`
    : `**${fmt(c.views)} views** · outlier **${c.outlier?.toFixed(1)}×** (mediana do canal ${fmt(c.medianaCanal)}) · ${fmt(c.comentarios)} comentários`;
  const ref = `**Referência:** [${c.canal}](${c.url}) · ${numeros}${classe?.tema ? `\n\n**Tema do original:** ${classe.tema}` : ''}`;
  if (r.serve === false) return `${cab}\n\n${ref}\n\n> Não serve para a trilha: ${r.motivo}\n`;

  const palavras = contarPalavras(r.fala);
  const linhas = [
    cab, '', ref, '',
    `**Por que viralizou:** ${r.por_que_viralizou}`, '',
    `**Forma do original:** ${r.forma_original} (${r.palavras_original} palavras${c.segundos ? ` em ${c.segundos}s` : ''})`, '',
    `**Frame 0 (na tela):** \`${r.frame0}\``, '',
    '**Fala:**', '', `> ${r.fala}`, '',
    `_${palavras} palavras · ~${Math.round(palavras / 2.7)}s_`, '',
    `**Texto na tela:** ${(r.texto_tela || []).map((t) => `\`${t}\``).join(' → ')}`, '',
  ];
  if (r.validar?.length) {
    linhas.push('**Validar antes de gravar:**', '');
    for (const v of r.validar) linhas.push(`- [ ] ${v.ponto} _(${v.confianca}; ${v.origem})_`);
    linhas.push('');
  }
  if (problemas.length) linhas.push('> ⚠️ Conferência automática:', ...problemas.map((p) => `> - ${p}`), '');
  if (fichaMd) linhas.push(fichaMd);
  linhas.push(
    `### Material: ${r.material?.nome}`, '',
    r.material?.subtitulo ? `_${r.material.subtitulo}_\n` : '',
    '```', r.material?.conteudo || '', '```', '',
    '### Mensagem de entrega (DM)', '',
    '```', r.mensagem_dm || '', '```', '',
    `Para publicar no site: \`node bin/aprovar.mjs ${r.palavra_chave} --publicar\``, '',
    `<details><summary>Transcrição do original</summary>\n\n${transcricao || '(sem transcrição)'}\n\n</details>`, '',
  );
  return linhas.join('\n');
}

export function relatorioDoDia({ data, trilha, tabelaIG, tabelaYT, roteiros, transcricoes, descobertos, avisos, cota, chamadasIG }) {
  const uteis = roteiros.filter((i) => i.roteiro?.serve !== false);
  const partes = [
    `# ${trilha.nome} · ${data}`,
    '',
    `${uteis.length} roteiro(s) prontos.${chamadasIG ? ` Chamadas à API do Instagram: ${chamadasIG}.` : ''}${cota ? ` Cota do YouTube: ${cota} de 10.000.` : ''}`,
    '',
    'Palavras-chave para cadastrar no Pakki Engage (**correspondência exata**, nunca "contém"): ' +
      (uteis.map((i) => `**${i.roteiro.palavra_chave}**`).join(', ') || 'nenhuma'),
    '',
  ];
  if (avisos?.length) partes.push('> ' + avisos.join('\n> '), '');
  partes.push('---', '', ...roteiros.map((it, i) => roteiroEmMarkdown(it, i)), '---', '');
  if (tabelaIG) partes.push(tabelaIG, '');
  if (tabelaYT) partes.push(tabelaYT, '');
  if (descobertos?.length) {
    partes.push('### Perfis novos descobertos hoje', '',
      ...descobertos.map((d) => `- [@${d.username}](https://www.instagram.com/${d.username}/) · ${fmt(d.seguidores)} seguidores`), '');
  }
  if (transcricoes?.length) {
    partes.push('### Transcrições do top', '');
    for (const t of transcricoes) {
      partes.push(`<details><summary>${t.candidato.canal} · ${fmt(t.candidato.comentarios)} comentários · ${t.origem || ''}</summary>\n\n${t.candidato.url}\n\n${t.texto}\n\n</details>`, '');
    }
  }
  return partes.join('\n');
}

export function salvarRelatorio(dir, nome, conteudo, json) {
  fs.mkdirSync(dir, { recursive: true });
  const md = path.join(dir, `${nome}.md`);
  fs.writeFileSync(md, conteudo);
  if (json) fs.writeFileSync(path.join(dir, `${nome}.json`), JSON.stringify(json, null, 2));
  return md;
}
