import { extrairJson } from './prompts.mjs';

/**
 * Classifica a lista do dia, como fizemos à mão no levantamento de 11/11:
 * tema em uma linha + "direto" (já é do nicho), "adaptavel" (troca o exemplo e serve)
 * ou "nao_serve" + a ideia de adaptação em uma linha. Uma chamada só por trilha.
 */
export const SISTEMA_LEVANTAMENTO = `Você classifica posts que viralizaram para um produtor de reels de advocacia no Brasil.
Para cada post, a partir da legenda (e da transcrição, quando houver), devolva:
- "tema": o assunto em UMA linha, em português, concreto (ex.: "4 prompts para ver o que o ChatGPT memorizou sobre você").
- "classe": "direto" (já é do nicho da trilha), "adaptavel" (o mesmo formato serve ao público da trilha trocando o exemplo)
  ou "nao_serve" (sem ponte honesta com o público; ex.: astrologia, games, finanças pessoais sem ligação).
- "adaptacao": em UMA linha, como vira um reel para o público da trilha (vazio se "nao_serve").
- "gatilho": true se o post pede para comentar uma palavra ("comment X", "comenta X").
- "idioma": "pt", "en", "hi", "es" ou outro código, pelo idioma da legenda e da fala.
- "grupo": o assunto em 1 a 3 palavras, minúsculas (ex.: "pix e receita", "perícia social", "aposentado na casa",
  "prompts secretos", "memória do chatgpt"). Posts sobre a MESMA coisa recebem EXATAMENTE o mesmo grupo,
  mesmo que o ângulo seja diferente. É isso que evita dois roteiros iguais no mesmo dia.
Não invente: use só o texto recebido. Responda SOMENTE com JSON: {"itens":[{"id":"","tema":"","grupo":"","classe":"","adaptacao":"","gatilho":false,"idioma":""}]}`;

export function pedidoLevantamento(trilha, candidatos) {
  const linhas = candidatos.map((c) => ({
    id: c.id,
    autor: c.canal,
    comentarios: c.comentarios,
    legenda: (c.descricao || c.titulo || '').replace(/\s+/g, ' ').slice(0, 500),
    ...(c.transcricao ? { fala: c.transcricao.slice(0, 600) } : {}),
  }));
  return `TRILHA: ${trilha.nome}\nPúblico: ${trilha.publico}\nObjetivo: ${trilha.objetivo}\n\nPOSTS:\n${JSON.stringify(linhas, null, 1)}`;
}

export async function classificar(trilha, candidatos, { chamar, opcoes }) {
  if (!candidatos.length) return new Map();
  const mapa = new Map();
  for (let i = 0; i < candidatos.length; i += 40) {
    const lote = candidatos.slice(i, i + 40);
    const r = extrairJson(await chamar(SISTEMA_LEVANTAMENTO, pedidoLevantamento(trilha, lote), opcoes));
    for (const it of r.itens || []) if (it?.id) mapa.set(it.id, it);
  }
  return mapa;
}

const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('pt-BR') : '?');
const ICONE = { direto: '⚖️ direto', adaptavel: '✅ adaptável', nao_serve: '❌ não serve' };

/** Tabela do levantamento no formato do relatório que você aprovou. */
export function tabelaLevantamento(lista, classes, { titulo, linhaMetrica }) {
  if (!lista.length) return `### ${titulo}\n\nNenhum post passou do corte hoje.\n`;
  const linhas = [
    `### ${titulo}`,
    '',
    linhaMetrica,
    '',
    '| # | Perfil | Comentários | Outlier | Link | Tema | Classe | Como adaptar |',
    '|---|---|---|---|---|---|---|---|',
  ];
  lista.forEach((c, i) => {
    const k = classes.get(c.id) || {};
    const idioma = k.idioma && k.idioma !== 'pt' && k.idioma !== 'en' ? ` (${k.idioma})` : '';
    linhas.push(
      `| ${i + 1} | ${c.canal}${idioma} | ${fmt(c.comentarios)} | ${c.outlier ? `${c.outlier.toFixed(1)}×` : '–'} | [abrir](${c.url}) | ${limpar(k.tema || c.titulo)}${k.gatilho ? ' 🔁' : ''} | ${ICONE[k.classe] || '?'} | ${limpar(k.adaptacao || '')} |`,
    );
  });
  linhas.push('', '🔁 = usa "comenta PALAVRA".', '');
  return linhas.join('\n');
}

function limpar(t) {
  return String(t || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
}
