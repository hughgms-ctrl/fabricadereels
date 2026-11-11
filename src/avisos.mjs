import fs from 'node:fs';
import path from 'node:path';
import { esc, pre, criarTelegram, tokenDoBot } from './telegram.mjs';
import { lerJson } from './util.mjs';

/**
 * Mensagens de cada etapa da fábrica, no grupo e tópico certos.
 * data/telegram.json (preenchido pelo 13-telegram.bat):
 *   { "previdenciario": { "grupo": "Advocacia", "mapeamento": {chatId, threadId}, "pautas": ..., ... }, ... }
 */
export const ETAPAS = ['mapeamento', 'pautas', 'roteiro', 'edicao', 'publicacao', 'metricas'];
export const NOMES_ETAPAS = {
  mapeamento: 'Mapeamento', pautas: 'Pautas', roteiro: 'Roteiro',
  edicao: 'Edição', publicacao: 'Publicação', metricas: 'Métricas',
};

const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('pt-BR') : '?');
const link = (url, texto) => `<a href="${esc(url)}">${esc(texto)}</a>`;

export function criarAvisos({ raiz, env = process.env, fetch: f, log = () => {} }) {
  const cfg = lerJson(path.join(raiz, 'data', 'telegram.json'), {});
  const token = tokenDoBot(env);
  const tg = token ? criarTelegram({ token, fetch: f }) : null;

  const destino = (trilhaId, etapa) => cfg[trilhaId]?.[etapa] || null;
  const ligado = (trilhaId) => Boolean(tg && cfg[trilhaId]);

  /** Nunca derruba a fábrica: Telegram fora do ar vira só uma linha no log. */
  async function enviar(trilhaId, etapa, blocos, fotoArquivo = null, legenda = '') {
    const d = destino(trilhaId, etapa);
    if (!tg || !d) return false;
    try {
      if (fotoArquivo && fs.existsSync(fotoArquivo)) await tg.foto(d, fotoArquivo, legenda);
      if (blocos?.length) await tg.texto(d, blocos);
      return true;
    } catch (e) {
      log(`  Telegram (${etapa}): ${e.message}`);
      return false;
    }
  }

  return { enviar, ligado, destino, tg, cfg };
}

// ---------- textos ----------

export function msgMapeamento({ trilha, data, perfisLidos, descobertos = [], listaIG = [], listaYT = [], servem, avisos = [] }) {
  const ig = trilha.instagram || {};
  const linhas = [
    `📊 <b>Mapeamento · ${esc(trilha.nome)} · ${esc(data)}</b>`,
    '',
    `Instagram: ${fmt(perfisLidos)} perfis lidos · <b>${fmt(listaIG.length)}</b> posts com ${fmt(ig.minimoComentarios)}+ comentários em ${ig.janelaDias ?? 90} dias`,
    `YouTube: <b>${fmt(listaYT.length)}</b> Shorts com outlier de ${trilha.youtube?.minimoOutlier ?? 5}× ou mais`,
    `Servem para a trilha: <b>${fmt(servem)}</b>`,
  ];
  if (descobertos.length) {
    linhas.push('', '<b>Perfis novos encontrados</b> (entram na lista a partir de hoje):');
    for (const d of descobertos) linhas.push(`• ${link(`https://www.instagram.com/${d.username}/`, `@${d.username}`)} · ${fmt(d.seguidores)} seguidores`);
    linhas.push('<i>Para tirar: responda "tira @perfil".</i>');
  }
  if (avisos.length) linhas.push('', ...avisos.map((a) => `⚠️ ${esc(a)}`));
  return [linhas.join('\n')];
}

export function msgPautas({ trilha, data, pautas, comRoteiroHoje = new Set() }) {
  if (!pautas.length) return [`📝 <b>Pautas · ${esc(data)}</b>\n\nNenhuma pauta nova hoje.`];
  const blocos = [`📝 <b>Pautas · ${esc(trilha.nome)} · ${esc(data)}</b>\n<i>✍️ = roteiro já escrito hoje (vai no tópico Roteiro)</i>`];
  for (const p of pautas) {
    const c = p.candidato;
    const k = p.classe || {};
    const numeros = c.fonte === 'instagram'
      ? `${fmt(c.comentarios)} comentários`
      : `${fmt(c.views)} views · ${c.outlier ? `${c.outlier.toFixed(0)}×` : ''}`;
    blocos.push([
      `<b>${p.numero}.</b> ${comRoteiroHoje.has(c.id) ? '✍️ ' : ''}${esc(k.tema || c.titulo)}`,
      `${link(c.url, c.canal || 'abrir')} · ${numeros}${k.classe === 'direto' ? ' · ⚖️ direto' : ''}`,
      k.adaptacao ? `↳ <i>${esc(k.adaptacao)}</i>` : '',
    ].filter(Boolean).join('\n'));
  }
  blocos.push('<i>Para escrever outro: responda "roteiro 4" (o número da pauta).</i>');
  return blocos;
}

export function msgRoteiro(item) {
  const { candidato: c, roteiro: r, problemas = [] } = item;
  if (r.serve === false) return [`✖️ Pauta descartada pelo roteirista: ${esc(r.motivo)}\n${link(c.url, c.canal)}`];
  const numeros = c.fonte === 'instagram' ? `${fmt(c.comentarios)} comentários` : `${fmt(c.views)} views · ${c.outlier?.toFixed(0)}×`;
  const tema = item.classe?.tema;
  const blocos = [
    `✍️ <b>Comenta ${esc(r.palavra_chave)}</b>\nReferência: ${link(c.url, c.canal)} · ${numeros}${item.ajuste ? `\n<i>Ajustado: ${esc(item.ajuste)}</i>` : ''}`,
    [
      tema ? `<b>Tema do original:</b> ${esc(tema)}` : '',
      r.por_que_viralizou ? `<b>Por que viralizou:</b> ${esc(r.por_que_viralizou)}` : '',
      item.classe?.adaptacao ? `<b>Ideia para o seu público:</b> ${esc(item.classe.adaptacao)}` : '',
    ].filter(Boolean).join('\n'),
    `<b>Frame 0:</b> ${esc(r.frame0)}`,
    `<b>Fala</b> (${r.fala.split(/\s+/).length} palavras):\n${esc(r.fala)}`,
    `<b>Texto na tela:</b> ${esc((r.texto_tela || []).join(' → '))}`,
  ];
  if (r.validar?.length) {
    blocos.push(`<b>⚠️ Validar antes de gravar:</b>\n${r.validar.map((v) => `• ${esc(v.ponto)} <i>(${esc(v.confianca)})</i>`).join('\n')}`);
  }
  if (problemas.length) blocos.push(`<i>Conferência automática: ${esc(problemas.join('; '))}</i>`);
  blocos.push(`<b>Material: ${esc(r.material?.nome)}</b>${r.material?.subtitulo ? `\n<i>${esc(r.material.subtitulo)}</i>` : ''}`);
  blocos.push(...pre(r.material?.conteudo || ''));
  blocos.push(`<b>Mensagem de entrega (DM):</b>`, ...pre(r.mensagem_dm || ''));
  blocos.push(`<i>Responda "ajusta ${esc(r.palavra_chave)}: o que mudar" ou, depois de validar, "publica ${esc(r.palavra_chave)}".</i>`);
  return blocos;
}

export function msgEdicao(item) {
  const { candidato: c, roteiro: r, ficha } = item;
  const numeros = c.fonte === 'instagram' ? `${fmt(c.comentarios)} comentários` : `${fmt(c.views)} views`;
  const tema = item.classe?.tema || c.titulo || '';
  const legenda = [
    `🎬 <b>${esc(r.palavra_chave)}</b> · ${link(c.url, c.canal)} · ${numeros}`,
    tema ? `<b>Tema:</b> ${esc(tema.slice(0, 300))}` : '',
    'Imagem: um quadro de cada plano do vídeo original.',
  ].filter(Boolean).join('\n');
  // A mensagem da Edição se basta: tema, o seu roteiro e como editar, sem trocar de tópico.
  const blocos = [
    `<b>O que você vai gravar</b> (roteiro completo no tópico Roteiro)\n<b>Frame 0:</b> ${esc(r.frame0)}`,
    `<b>Fala:</b>\n${esc(r.fala)}`,
    `<b>Cartelas:</b> ${esc((r.texto_tela || []).join(' → '))}`,
  ];
  if (ficha?.ritmo) {
    const rt = ficha.ritmo;
    blocos.push(ficha.cortes?.length
      ? `<b>Ritmo:</b> ${rt.planos} planos · plano médio ${rt.planoMedio}s · gancho até ${rt.gancho?.toFixed?.(1) ?? rt.gancho}s\n<b>Cortes em:</b> ${ficha.cortes.map((t) => `${t.toFixed(1)}s`).join(' · ')}`
      : '<b>Ritmo:</b> plano único (câmera parada, fala direta)');
  }
  if (item.pedidoEdicao) blocos.push('<b>Pedido para o Claude editar igual</b> (mande junto com o seu vídeo bruto):', ...pre(item.pedidoEdicao));
  else blocos.push(`<i>Ficha indisponível: ${esc(item.fichaErro || 'sem vídeo')}. Abra a referência pelo link.</i>`);
  return { legenda, blocos };
}

export function msgPublicacao({ palavra, url, mensagemDm, site }) {
  return [
    `🚀 <b>${esc(palavra)} publicado</b>${site ? ` no site ${esc(site)}` : ''}`,
    url ? `Link para a DM: ${esc(url)}` : '<i>Configure o domínio do site em config/sites.json para o link sair pronto.</i>',
    `Cadastre a palavra <b>${esc(palavra)}</b> na automação de comentários como <b>correspondência exata</b>.`,
    ...(mensagemDm ? ['<b>Mensagem de entrega:</b>', ...pre(url ? `${mensagemDm}\n\n${url}` : mensagemDm)] : []),
  ];
}
