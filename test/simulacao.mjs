/**
 * Dados de exemplo para `--simular` e para os testes: imitam as respostas das APIs
 * do YouTube e da Meta, o yt-dlp e o Claude Code. Nada aqui sai para a internet.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIA = 86400000;
const iso = (diasAtras) => new Date(Date.now() - diasAtras * DIA).toISOString();

// Canal A: costuma ter ~3 mil views; o v1 explodiu (outlier ~170×).
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
  for (let i = 0; i < 12; i++) {
    VIDEOS[`${ch}u${i}`] = { ch, views: c.base + i * 50, titulo: `antigo ${i}`, dur: 'PT30S', dias: 30 + i };
  }
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
      const m = /username\(([^)]+)\)/.exec(p.get('fields'));
      const username = m?.[1] || 'perfil';
      const media = Array.from({ length: 10 }, (_, i) => ({
        id: `${username}-${i}`,
        caption: i === 0 ? 'Comment PROMPT and I will send you the guide' : `post ${i}`,
        comments_count: i === 0 ? 40000 : 300 + i,
        like_count: 1000,
        media_type: 'VIDEO',
        media_product_type: 'REELS',
        permalink: `https://www.instagram.com/reel/${username}${i}/`,
        timestamp: iso(5 + i),
      }));
      return json({ business_discovery: { username, followers_count: 100000, media_count: 300, media: { data: media } } });
    }
    return json({ error: { message: `não simulado: ${u.href}` } }, 404);
  };
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

/** Imita o yt-dlp (legenda) e falha no download de áudio, como num celular sem modelo. */
export async function runSimulado(bin, args) {
  if (bin === 'yt-dlp' && args.includes('--write-subs')) {
    const modelo = args[args.indexOf('-o') + 1];
    fs.writeFileSync(path.join(path.dirname(modelo), 'v.pt.vtt'), VTT_EXEMPLO);
    return '';
  }
  throw new Error(`${bin} não disponível na simulação`);
}

let contador = 0;
const PALAVRAS = ['CASA', 'PRAZO', 'RENDA', 'LAUDO', 'CORTE', 'PROMPT', 'SIGILO'];

/** Imita o Claude Code devolvendo um roteiro válido no formato do Kit. */
export async function chamarSimulado(_sistema, pedido) {
  const usadas = (/PALAVRAS JÁ USADAS \(não repita\): (.*)$/m.exec(pedido)?.[1] || '').split(', ');
  let palavra = PALAVRAS[contador++ % PALAVRAS.length];
  while (usadas.includes(palavra)) palavra = PALAVRAS[contador++ % PALAVRAS.length];
  return JSON.stringify({
    serve: true,
    motivo: '',
    forma_original: 'RESPOSTA → CONDIÇÃO ESPECÍFICA → FUNDAMENTO',
    palavras_original: 44,
    por_que_viralizou: 'Corrige a crença de que só cabe um benefício por casa.',
    frame0: 'TEM APOSENTADO EM CASA? PODE PEDIR O BPC?',
    fala: `Sim. Se o seu marido é aposentado e ganha um salário mínimo, você pode pedir o BPC, porque essa aposentadoria sai da conta da renda. O que derruba é o CadÚnico desatualizado. Comenta ${palavra} que eu te mostro como conferir.`,
    texto_tela: ['SIM, PODE', 'A LEI TIRA ELA DA CONTA', `COMENTA: ${palavra}`],
    palavra_chave: palavra,
    material: { nome: 'Teste da Casa Cheia', subtitulo: '6 passos', conteudo: 'PASSO 1 ...\n[ ] ...\nEste material é informativo e não substitui a análise do seu caso.' },
    mensagem_dm: 'Oi! Aqui está o seu material. Qual passo travou você?',
    validar: [{ ponto: 'Exclusão da aposentadoria de até 1 salário mínimo', confianca: 'alta', origem: 'transcrição' }],
  });
}
