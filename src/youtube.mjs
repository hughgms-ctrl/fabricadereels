import { duracaoIsoEmSegundos, mediana } from './util.mjs';
import { outlier } from './outlier.mjs';

const BASE = 'https://www.googleapis.com/youtube/v3';
const SHORT_MAX_SEGUNDOS = 180;
const CACHE_CANAL_DIAS = 7;

/** Custo em unidades de cota de cada chamada (documentação oficial da YouTube Data API v3). */
const CUSTO = { search: 100, videos: 1, channels: 1, playlistItems: 1 };

export function criarYoutube({ chave, fetch: f = globalThis.fetch, cacheCanais = {}, agora = () => Date.now() }) {
  if (!chave) throw new Error('Falta YOUTUBE_API_KEY no .env');
  let cotaUsada = 0;

  async function chamar(recurso, params) {
    const url = new URL(`${BASE}/${recurso}`);
    for (const [k, v] of Object.entries({ ...params, key: chave })) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    cotaUsada += CUSTO[recurso] ?? 1;
    const r = await f(url);
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) {
      const motivo = corpo?.error?.errors?.[0]?.reason || corpo?.error?.message || r.status;
      throw new Error(`YouTube ${recurso}: ${motivo}`);
    }
    return corpo;
  }

  async function detalhes(ids) {
    const saida = [];
    for (let i = 0; i < ids.length; i += 50) {
      const lote = ids.slice(i, i + 50);
      if (!lote.length) continue;
      const r = await chamar('videos', { part: 'snippet,statistics,contentDetails', id: lote.join(','), maxResults: 50 });
      saida.push(...(r.items || []));
    }
    return saida.map(normalizarVideo);
  }

  async function buscar(termo, { regionCode, relevanceLanguage, publicadoDepois, publicadoAntes }) {
    const r = await chamar('search', {
      part: 'id',
      type: 'video',
      videoDuration: 'short',
      order: 'viewCount',
      maxResults: 25,
      q: termo,
      regionCode,
      relevanceLanguage,
      publishedAfter: publicadoDepois?.toISOString(),
      publishedBefore: publicadoAntes?.toISOString(),
    });
    return (r.items || []).map((i) => i.id?.videoId).filter(Boolean);
  }

  /** Mediana de views dos Shorts recentes do canal, com cache de 7 dias. */
  async function medianaCanal(canalId) {
    const c = cacheCanais[canalId];
    if (c && agora() - c.em < CACHE_CANAL_DIAS * 86400000) return c;
    const canal = await chamar('channels', { part: 'contentDetails,statistics', id: canalId });
    const uploads = canal.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return null;
    const pl = await chamar('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: 50 });
    const ids = (pl.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
    const videos = await detalhes(ids);
    const shorts = videos.filter((v) => v.segundos !== null && v.segundos <= SHORT_MAX_SEGUNDOS);
    const views = shorts.map((v) => v.views);
    const registro = {
      em: agora(),
      mediana: mediana(views),
      amostra: views.length,
      inscritos: Number(canal.items?.[0]?.statistics?.subscriberCount) || null,
      views,
    };
    cacheCanais[canalId] = registro;
    return registro;
  }

  /**
   * Minera uma trilha: busca os termos, pega os Shorts e calcula o outlier de cada um
   * contra a mediana do próprio canal (sem o próprio vídeo na conta).
   */
  async function minerar(trilha, { agoraData = new Date(), log = () => {} } = {}) {
    const y = trilha.youtube;
    if (!y?.buscas?.length) return [];
    const [minDias, maxDias] = y.janelaDias || [3, 60];
    const publicadoDepois = new Date(agoraData.getTime() - maxDias * 86400000);
    const publicadoAntes = new Date(agoraData.getTime() - minDias * 86400000);

    const ids = new Set();
    for (const termo of y.buscas) {
      try {
        for (const id of await buscar(termo, { ...y, publicadoDepois, publicadoAntes })) ids.add(id);
      } catch (e) {
        log(`  busca "${termo}" falhou: ${e.message}`);
        if (/quota/i.test(e.message)) break;
      }
    }
    const videos = (await detalhes([...ids])).filter(
      (v) => v.segundos !== null && v.segundos <= SHORT_MAX_SEGUNDOS,
    );

    const candidatos = [];
    for (const v of videos) {
      let base;
      try {
        base = await medianaCanal(v.canalId);
      } catch (e) {
        log(`  canal ${v.canal} falhou: ${e.message}`);
        continue;
      }
      if (!base) continue;
      const outrosDoCanal = removerUmaVez(base.views, v.views);
      if (outrosDoCanal.length < 5) continue; // canal sem histórico suficiente
      candidatos.push({
        ...v,
        fonte: 'youtube',
        metrica: v.views,
        metricaNome: 'views',
        medianaCanal: mediana(outrosDoCanal),
        amostraCanal: outrosDoCanal.length,
        outlier: outlier(v.views, outrosDoCanal),
      });
    }
    return candidatos;
  }

  return { minerar, detalhes, medianaCanal, buscar, cota: () => cotaUsada, cacheCanais };
}

function removerUmaVez(lista, valor) {
  const i = lista.indexOf(valor);
  return i === -1 ? lista.slice() : [...lista.slice(0, i), ...lista.slice(i + 1)];
}

export function normalizarVideo(item) {
  const s = item.statistics || {};
  return {
    id: `yt:${item.id}`,
    videoId: item.id,
    url: `https://www.youtube.com/shorts/${item.id}`,
    titulo: item.snippet?.title || '',
    descricao: item.snippet?.description || '',
    canal: item.snippet?.channelTitle || '',
    canalId: item.snippet?.channelId || '',
    publicadoEm: item.snippet?.publishedAt || null,
    idioma: item.snippet?.defaultAudioLanguage || item.snippet?.defaultLanguage || null,
    segundos: duracaoIsoEmSegundos(item.contentDetails?.duration),
    views: Number(s.viewCount) || 0,
    curtidas: Number(s.likeCount) || 0,
    comentarios: Number(s.commentCount) || 0,
  };
}
