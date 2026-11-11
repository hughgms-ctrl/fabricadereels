/**
 * Dados de exemplo para `--simular` e para os testes: imitam as APIs do YouTube e da Meta,
 * o yt-dlp, o Whisper e o Claude Code. Nada sai para a internet. O ffmpeg roda de verdade
 * (num vídeo de 3 cenas gerado na hora), para a ficha de edição ser testada de ponta a ponta.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executar } from '../src/transcrever.mjs';

const DIA = 86400000;
const iso = (diasAtras) => new Date(Date.now() - diasAtras * DIA).toISOString();

// ---------- YouTube ----------
// Canal A: costuma ter ~3 mil views; o v1 explodiu (outlier ~155×).
// Canal B: costuma ter ~100 mil; o v2 tem 200 mil (outlier 2×, fica de fora).
const CANAIS = {
  chA: { titulo: 'Advocacia Exemplo A', uploads: 'upA', base: 3000, candidato: 'v1' },
  chB: { titulo: 'Canal Grande B', uploads: 'upB', base: 100000, candidato: 'v2' },
};
const VIDEOS = {
  v1: { ch: 'chA', views: 510000, titulo: 'Pode ter BPC e aposentadoria na mesma casa?', dur: 'PT17S', dias: 12 },
  v2: { ch: 'chB', views: 200000, titulo: 'Novidade do INSS', dur: 'PT40S', dias: 9 },
};
for (const [ch, c] of Object.entries(CANAIS)) {
  for (let i = 0; i < 12; i++) VIDEOS[`${ch}u${i}`] = { ch, views: c.base + i * 50, titulo: `antigo ${i}`, dur: 'PT30S', dias: 30 + i };
}
function itemVideo(id) {
  const v = VIDEOS[id];
  return {
    id,
    snippet: { title: v.titulo, description: '', channelTitle: CANAIS[v.ch].titulo, channelId: v.ch, publishedAt: iso(v.dias) },
    statistics: { viewCount: String(v.views), likeCount: '100', commentCount: '50' },
    contentDetails: { duration: v.dur },
  };
}

// ---------- Instagram ----------
// Cada perfil tem 60 posts (2 páginas: 50 + 10), um a cada 1,5 dia.
// O post 0 de cada um tem 40 mil comentários e cita @parceiro_grande (300 mil seguidores),
// que por sua vez cita @parceiro_pequeno (2 mil: não entra).
const SEGUIDORES = { parceiro_grande: 300000, parceiro_pequeno: 2000 };
function midiasDe(username) {
  return Array.from({ length: 60 }, (_, i) => ({
    id: `${username}-${i}`,
    caption: i === 0
      ? `Comment PROMPT and I'll send you the guide. With @${username === 'parceiro_grande' ? 'parceiro_pequeno' : 'parceiro_grande'}`
      : i === 1 ? 'My new course is live' : `post ${i}`,
    comments_count: i === 0 ? 40000 : i === 1 ? 12000 : 300 + i,
    like_count: 1000,
    view_count: 90000,
    media_type: i === 1 ? 'CAROUSEL_ALBUM' : 'VIDEO',
    media_product_type: i === 1 ? 'FEED' : 'REELS',
    permalink: `https://www.instagram.com/reel/${username}${i}/`,
    timestamp: iso(2 + i * 1.5),
    media_url: i === 0 ? `https://video.exemplo/${username}0.mp4` : undefined,
  }));
}

const json = (corpo, status = 200) => ({ ok: status < 400, status, json: async () => corpo });

export function criarFetchSimulado() {
  return async (url) => {
    const u = new URL(url);
    const p = u.searchParams;
    if (u.hostname === 'www.googleapis.com') {
      const recurso = u.pathname.split('/').pop();
      if (recurso === 'search') return json({ items: [{ id: { videoId: 'v1' } }, { id: { videoId: 'v2' } }] });
      if (recurso === 'videos') return json({ items: p.get('id').split(',').filter((id) => VIDEOS[id]).map(itemVideo) });
      if (recurso === 'channels') {
        const c = CANAIS[p.get('id')];
        return json({ items: [{ contentDetails: { relatedPlaylists: { uploads: c.uploads } }, statistics: { subscriberCount: '1000' } }] });
      }
      if (recurso === 'playlistItems') {
        const ch = Object.keys(CANAIS).find((k) => CANAIS[k].uploads === p.get('playlistId'));
        const ids = [CANAIS[ch].candidato, ...Array.from({ length: 12 }, (_, i) => `${ch}u${i}`)];
        return json({ items: ids.map((videoId) => ({ contentDetails: { videoId } })) });
      }
    }
    if (u.hostname === 'graph.facebook.com') {
      const campos = p.get('fields') || '';
      const username = /username\(([^)]+)\)/.exec(campos)?.[1] || 'perfil';
      const seguidores = SEGUIDORES[username] ?? 150000;
      if (!campos.includes('media.limit')) return json({ business_discovery: { username, followers_count: seguidores } });
      const depois = /\.after\(([^)]+)\)/.exec(campos)?.[1];
      const todas = midiasDe(username);
      const ini = depois ? Number(depois) : 0;
      const pagina = todas.slice(ini, ini + 50);
      const proximo = ini + 50 < todas.length ? String(ini + 50) : null;
      return json({
        business_discovery: {
          username, followers_count: seguidores, media_count: todas.length,
          media: { data: pagina, paging: proximo ? { cursors: { after: proximo } } : {} },
        },
      });
    }
    return json({ error: { message: `não simulado: ${u.href}` } }, 404);
  };
}

// ---------- vídeo de exemplo (ffmpeg real) ----------
let videoExemplo = null;
async function gerarVideoExemplo() {
  if (videoExemplo && fs.existsSync(videoExemplo)) return videoExemplo;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-video-'));
  videoExemplo = path.join(dir, 'exemplo.mp4');
  await executar('ffmpeg', [
    '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=360x640:d=2',
    '-f', 'lavfi', '-i', 'color=c=blue:s=360x640:d=2.5', '-f', 'lavfi', '-i', 'color=c=green:s=360x640:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6.5',
    '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0,format=yuv420p[v]', '-map', '[v]', '-map', '3:a',
    '-r', '30', '-shortest', videoExemplo,
  ]);
  return videoExemplo;
}

export async function fetchVideoSimulado() {
  const buf = fs.readFileSync(await gerarVideoExemplo());
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}

export const VTT_EXEMPLO = `WEBVTT
Kind: captions
Language: pt

00:00:00.000 --> 00:00:02.000
Sim. Se o seu marido

00:00:01.000 --> 00:00:03.000
Sim. Se o seu marido é aposentado

00:00:03.000 --> 00:00:06.000
e ganha um salário mínimo, você pode pedir o BPC.
`;

/** Imita yt-dlp e whisper-cli; ffmpeg e ffprobe rodam de verdade. */
export async function runSimulado(bin, args) {
  if (bin === 'yt-dlp' && args.includes('--write-subs')) {
    const modelo = args[args.indexOf('-o') + 1];
    fs.writeFileSync(path.join(path.dirname(modelo), 'v.pt.vtt'), VTT_EXEMPLO);
    return '';
  }
  if (bin === 'yt-dlp') {
    fs.copyFileSync(await gerarVideoExemplo(), args[args.indexOf('-o') + 1]);
    return '';
  }
  if (/whisper/.test(bin)) {
    const saida = args[args.indexOf('-of') + 1];
    fs.writeFileSync(`${saida}.txt`, 'Three things to do when you start using Claude. Comment PROMPT and I send you the guide.');
    fs.writeFileSync(`${saida}.srt`, '1\n00:00:00,000 --> 00:00:02,500\nThree things to do when you start using Claude.\n\n2\n00:00:02,500 --> 00:00:05,000\nComment PROMPT and I send you the guide.\n');
    return '';
  }
  if (bin === 'ffmpeg' || bin === 'ffprobe') return executar(bin, args);
  throw new Error(`${bin} não disponível na simulação`);
}

/** Cria um arquivo de modelo de mentira para o Whisper simulado passar da checagem. */
export function prepararWhisperSimulado() {
  const modelo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sim-modelo-')), 'ggml-base.bin');
  fs.writeFileSync(modelo, 'modelo de mentira');
  return modelo;
}

let contador = 0;
const PALAVRAS = ['CASA', 'PRAZO', 'RENDA', 'LAUDO', 'CORTE', 'PROMPT', 'SIGILO', 'ROTINA', 'AGENTE'];

/** Imita o Claude Code: classificação do levantamento ou roteiro no formato do Kit. */
export async function chamarSimulado(sistema, pedido) {
  if (String(sistema).startsWith('Você classifica')) {
    const posts = JSON.parse(pedido.slice(pedido.indexOf('POSTS:') + 6));
    return JSON.stringify({
      itens: posts.map((p) => ({
        id: p.id,
        tema: /course/i.test(p.legenda) ? 'Lançamento de curso próprio' : 'Prompt que melhora as respostas do Claude',
        classe: /course/i.test(p.legenda) ? 'nao_serve' : 'adaptavel',
        adaptacao: /course/i.test(p.legenda) ? '' : 'O mesmo prompt aplicado a uma petição, com dados anonimizados',
        gatilho: /comment/i.test(p.legenda),
        idioma: p.id.startsWith('yt:') ? 'pt' : 'en',
      })),
    });
  }
  const usadas = (/PALAVRAS JÁ USADAS \(não repita\): (.*)$/m.exec(pedido)?.[1] || '').split(', ');
  let palavra = PALAVRAS[contador++ % PALAVRAS.length];
  while (usadas.includes(palavra)) palavra = PALAVRAS[contador++ % PALAVRAS.length];
  return JSON.stringify({
    serve: true,
    motivo: '',
    forma_original: 'RESPOSTA → CONDIÇÃO ESPECÍFICA → FUNDAMENTO',
    palavras_original: 44,
    por_que_viralizou: 'Corrige uma crença comum com uma resposta direta.',
    frame0: 'TEM APOSENTADO EM CASA? PODE PEDIR O BPC?',
    fala: `Sim. Se o seu marido é aposentado e ganha um salário mínimo, você pode pedir o BPC, porque essa aposentadoria sai da conta da renda. O que derruba é o CadÚnico desatualizado. Comenta ${palavra} que eu te mostro como conferir.`,
    texto_tela: ['SIM, PODE', 'A LEI TIRA ELA DA CONTA', `COMENTA: ${palavra}`],
    palavra_chave: palavra,
    material: {
      nome: 'Teste da Casa Cheia',
      subtitulo: 'Descubra em 6 passos se você pode pedir o BPC',
      conteudo: 'PASSO 1 — QUEM ENTRA NA CONTA\n\nO INSS usa uma lista fechada.\n\n  [ ] Cônjuge\n  [ ] Filhos solteiros\n\n➜ ANOTE: quantas pessoas? _______\n\n⚠️ Atenção ao CadÚnico.\n\nEste material é informativo e não substitui a análise do seu caso.',
    },
    mensagem_dm: 'Oi! Aqui está o seu material. Qual passo travou você?',
    validar: [{ ponto: 'Exclusão da aposentadoria de até 1 salário mínimo', confianca: 'alta', origem: 'transcrição' }],
  });
}
