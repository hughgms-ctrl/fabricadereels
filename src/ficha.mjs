import fs from 'node:fs';
import path from 'node:path';
import { executar } from './transcrever.mjs';

/**
 * Ficha de edição do vídeo de referência: tudo o que você precisa mandar para o Claude
 * (ou um editor) para editar o SEU vídeo no mesmo ritmo. Tudo calculado no celular,
 * de graça, com ffmpeg:
 *  - duração, formato, fps
 *  - cada corte de cena com o tempo, ritmo (cortes por segundo, duração média do plano)
 *  - quanto dura o gancho (até o primeiro corte)
 *  - a fala com tempos (da legenda ou do Whisper)
 *  - capa (quadro de 0,5 s) e folha com um quadro de cada plano
 */

/**
 * Formato do yt-dlp: vídeo + ÁUDIO, juntos num mp4. YouTube e Instagram entregam os dois
 * separados; pedir só "mp4" trazia o arquivo mudo e o Whisper não tinha o que transcrever.
 */
export const FORMATO_YTDLP = 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[acodec!=none]/b';

export async function temAudio(video, { run = executar } = {}) {
  try {
    const s = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', video]);
    return String(s).trim().length > 0;
  } catch {
    return false;
  }
}

/** Baixa o vídeo com áudio: media_url direto da API quando vier; senão yt-dlp (Instagram pode pedir cookies). */
export async function baixarVideo(candidato, dir, { env = {}, run = executar, fetch: f = globalThis.fetch } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, 'referencia.mp4');
  if (fs.existsSync(destino)) return destino;
  if (candidato.midiaUrl) {
    try {
      const r = await f(candidato.midiaUrl);
      if (r.ok) {
        fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
        if (await temAudio(destino, { run })) return destino;
        fs.rmSync(destino, { force: true }); // veio mudo: tenta pelo yt-dlp
      }
    } catch {
      /* cai no yt-dlp */
    }
  }
  const args = ['-f', FORMATO_YTDLP, '--merge-output-format', 'mp4', '-o', destino, '--no-playlist', '--retries', '3'];
  if (env.IG_COOKIES && candidato.fonte === 'instagram') args.push('--cookies', env.IG_COOKIES);
  await run('yt-dlp', [...args, candidato.url]);
  if (!fs.existsSync(destino)) throw new Error('vídeo não baixou');
  return destino;
}

export async function sondar(video, { run = executar } = {}) {
  const saida = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
    '-of', 'json', video,
  ]);
  const j = JSON.parse(saida);
  const s = j.streams?.[0] || {};
  const [n, d] = String(s.r_frame_rate || '0/1').split('/').map(Number);
  return {
    segundos: Number(j.format?.duration) || null,
    largura: s.width || null,
    altura: s.height || null,
    fps: d ? Math.round((n / d) * 100) / 100 : null,
  };
}

/** Tempos dos cortes de cena (detector de cena do ffmpeg). */
export async function detectarCortes(video, { limiar = 0.06, run = executar } = {}) {
  // showinfo escreve no stderr; o executar devolve só stdout, então redirecionamos com -f null e lemos o log.
  // Limiar baixo de propósito: em vídeo de alguém falando para a câmera, o "corte seco"
  // (mesmo enquadramento, trecho tirado) muda pouco a imagem; troca de cena muda muito.
  const log = await run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', video,
    '-filter:v', `select='gt(scene,${limiar})',metadata=print:file=-`,
    '-an', '-f', 'null', '-',
  ]);
  return lerTemposDeCorte(log);
}

/**
 * Lê os tempos do log do ffmpeg. Junta detecções a menos de `minimo` segundos uma da outra
 * (um corte seco pode disparar em dois quadros seguidos; movimento rápido, em vários).
 */
export function lerTemposDeCorte(log, { minimo = 0.5 } = {}) {
  const tempos = [];
  for (const m of String(log).matchAll(/pts_time:([\d.]+)/g)) tempos.push(Number(m[1]));
  const ordenados = [...new Set(tempos.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
  const cortes = [];
  for (const t of ordenados) {
    if (t < minimo) continue; // o primeiro quadro não é corte
    if (!cortes.length || t - cortes[cortes.length - 1] >= minimo) cortes.push(t);
  }
  return cortes;
}

/** Extrai a capa e uma folha com um quadro do meio de cada plano (até 12). */
export async function quadros(video, cortes, duracao, dir, { run = executar } = {}) {
  const capa = path.join(dir, 'capa.jpg');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', video, '-frames:v', '1', '-vf', 'scale=540:-2', capa]);
  const limites = [0, ...cortes, duracao || cortes[cortes.length - 1] + 1];
  const meios = [];
  for (let i = 0; i < limites.length - 1 && meios.length < 12; i++) meios.push((limites[i] + limites[i + 1]) / 2);
  const tmp = path.join(dir, 'q');
  fs.mkdirSync(tmp, { recursive: true });
  for (const [i, t] of meios.entries()) {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=270:-2',
      path.join(tmp, `${String(i + 1).padStart(2, '0')}.jpg`)]);
  }
  const folha = path.join(dir, 'planos.jpg');
  const colunas = Math.min(4, meios.length || 1);
  const linhas = Math.ceil((meios.length || 1) / colunas);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(tmp, '%02d.jpg'),
    '-vf', `tile=${colunas}x${linhas}:padding=6:color=white`, '-frames:v', '1', folha]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { capa, folha, meios };
}

/** Lê VTT ou SRT em trechos com tempo. */
export function trechosComTempo(legenda) {
  const trechos = [];
  const blocos = String(legenda || '').split(/\r?\n\r?\n/);
  for (const b of blocos) {
    const m = /(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})\s+-->\s+(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})/.exec(b);
    if (!m) continue;
    const seg = (h, mi, s, ms) => (Number((h || '0:').slice(0, -1)) * 3600) + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
    const texto = b.split(/\r?\n/).slice(b.split(/\r?\n/).findIndex((l) => l.includes('-->')) + 1)
      .join(' ').replace(/<[^>]+>/g, '').trim();
    if (!texto) continue;
    const ini = seg(m[1], m[2], m[3], m[4]);
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && (texto === ultimo.texto || texto.startsWith(ultimo.texto))) {
      ultimo.texto = texto;
      ultimo.fim = seg(m[5], m[6], m[7], m[8]);
      continue;
    }
    trechos.push({ ini, fim: seg(m[5], m[6], m[7], m[8]), texto });
  }
  return trechos;
}

export function resumoRitmo({ segundos, cortes }) {
  const planos = cortes.length + 1;
  return {
    planos,
    cortesPorSegundo: segundos ? Math.round((cortes.length / segundos) * 100) / 100 : null,
    planoMedio: segundos ? Math.round((segundos / planos) * 10) / 10 : null,
    gancho: cortes.length ? cortes[0] : segundos,
  };
}

const s = (t) => (t == null ? '?' : `${t.toFixed(1)}s`);

export function fichaEmMarkdown({ candidato: c, info, cortes, ritmo, trechos, roteiro, arquivos }) {
  const linhas = [
    `#### Ficha de edição da referência`,
    '',
    `- **Vídeo de referência:** ${c.url}`,
    `- **Autor:** ${c.canal}${c.seguidores ? ` (${c.seguidores.toLocaleString('pt-BR')} seguidores)` : ''}`,
    `- **Números:** ${c.comentarios?.toLocaleString('pt-BR') ?? '?'} comentários · ${c.views?.toLocaleString('pt-BR') ?? '?'} views · ${c.curtidas?.toLocaleString('pt-BR') ?? '?'} curtidas`,
    `- **Formato:** ${info.largura}×${info.altura} · ${info.fps} fps · ${s(info.segundos)}`,
    cortes.length
      ? `- **Ritmo:** ${ritmo.planos} planos · ${ritmo.cortesPorSegundo} cortes/s · plano médio ${ritmo.planoMedio}s · gancho até ${s(ritmo.gancho)}`
      : '- **Ritmo:** plano único (câmera parada, fala direta)',
    `- **Cortes em:** ${cortes.map(s).join(' · ') || 'sem cortes (plano único)'}`,
    `- **Imagens:** \`${arquivos.capa}\` (capa) · \`${arquivos.folha}\` (um quadro por plano)`,
    '',
  ];
  if (trechos?.length) {
    linhas.push('**Fala com tempos:**', '', ...trechos.map((t) => `- \`${s(t.ini)}–${s(t.fim)}\` ${t.texto}`), '');
  }
  linhas.push(
    '**Pedido para o Claude editar igual** (cole junto com o seu vídeo bruto e a folha de planos; a referência vai pelo link):',
    '',
    '```',
    pedidoDeEdicao({ c, info, cortes, ritmo, roteiro }),
    '```',
    '',
  );
  return linhas.join('\n');
}

/** Formato de entrega: sempre o padrão do Reels, mesmo que a referência esteja em 4K. */
export function formatoEntrega(info) {
  const vertical = (info.altura || 0) >= (info.largura || 0);
  return vertical ? '1080x1920 (9:16)' : `${info.largura}x${info.altura}`;
}

export function pedidoDeEdicao({ c, info, cortes, ritmo, roteiro }) {
  const ritmoTexto = cortes.length
    ? [
        `- ${ritmo.planos} planos, um corte a cada ${ritmo.planoMedio}s em média; o primeiro corte em ${s(ritmo.gancho)} (é o fim do gancho).`,
        `- Tempos dos cortes da referência: ${cortes.map(s).join(', ')}. Use como guia, ajustando às minhas frases.`,
        '- A folha de planos anexa mostra o enquadramento de cada plano: repita a alternância (rosto, tela, objeto).',
      ]
    : [
        '- A referência é um plano único: câmera parada, a pessoa falando direto para a câmera, sem troca de cena.',
        '- Mantenha assim: só tire silêncios e erros, sem cortes de efeito. Se ficar longo, um zoom leve a cada frase ajuda a segurar.',
      ];
  return [
    'Edite o meu vídeo bruto (anexo) no mesmo ritmo desta referência:',
    `Referência: ${c.url}`,
    `- Formato vertical ${formatoEntrega(info)}, duração final perto de ${s(info.segundos)}.`,
    ...ritmoTexto,
    roteiro?.frame0 ? `- Primeiro frame com o texto na tela: "${roteiro.frame0}".` : '',
    roteiro?.texto_tela?.length ? `- Cartelas na ordem da fala: ${roteiro.texto_tela.join(' / ')}.` : '',
    '- Legenda palavra por palavra, centralizada no terço inferior, com a palavra-chave destacada.',
    '- Corte os silêncios e respirações. Sem introdução e sem despedida: começa e termina no conteúdo.',
    roteiro?.palavra_chave ? `- Último plano: "COMENTA ${roteiro.palavra_chave}" na tela.` : '',
  ].filter(Boolean).join('\n');
}

/** Monta a ficha completa de um candidato. Falhas viram aviso, nunca derrubam a rodada. */
export async function montarFicha(candidato, dir, { env, run = executar, fetch: f, legendaBruta = null, roteiro = null } = {}) {
  const video = await baixarVideo(candidato, dir, { env, run, fetch: f });
  const info = await sondar(video, { run });
  const cortes = await detectarCortes(video, { run });
  const ritmo = resumoRitmo({ segundos: info.segundos, cortes });
  const { capa, folha } = await quadros(video, cortes, info.segundos, dir, { run });
  const trechos = legendaBruta ? trechosComTempo(legendaBruta) : [];
  const rel = (p) => path.basename(p);
  const arquivos = { capa: rel(capa), folha: rel(folha) };
  // O vídeo só serve para medir cortes e tirar os quadros: depois disso sai.
  // No relatório fica o link da referência (MANTER_VIDEO=1 no .env guarda o arquivo).
  if (env?.MANTER_VIDEO !== '1') fs.rmSync(video, { force: true });
  return {
    info, cortes, ritmo, trechos, arquivos,
    markdown: fichaEmMarkdown({ candidato, info, cortes, ritmo, trechos, roteiro, arquivos }),
  };
}
