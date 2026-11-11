import { outlier } from './outlier.mjs';
import { mediana } from './util.mjs';

/** Versão fixa da Graph API. Nunca "latest": mudança de versão é decisão consciente. */
export const GRAPH_VERSAO = 'v27.0';
const BASE = `https://graph.facebook.com/${GRAPH_VERSAO}`;
const LIMITE_POR_RODADA = 180; // a Meta permite ~200 chamadas por hora por usuário

const CAMPOS_MIDIA = [
  'id', 'caption', 'comments_count', 'like_count', 'view_count', 'media_type',
  'media_product_type', 'permalink', 'timestamp', 'media_url',
].join(',');

/**
 * Instagram pela API oficial da Meta (grátis), repetindo o processo que fizemos no Apify:
 *
 *  1. Perfis grandes da trilha (semente) + os já descobertos em dias anteriores.
 *  2. Amplia com perfis "parecidos": o Instagram não entrega mais essa lista, então o
 *     substituto são os @ citados nas legendas dos posts desses perfis (parceiros, convidados,
 *     coautores). Só entram os que têm mais de N seguidores. Repete 2 rodadas.
 *  3. Puxa os posts dos últimos 90 dias de todos, paginando o perfil inteiro.
 *  4. COMENTÁRIO É A MÉTRICA PRINCIPAL: só passa quem tem mais de 10 mil, do maior pro menor.
 *     O outlier (comentários ÷ mediana do perfil) vai junto como informação, não como filtro.
 *
 * Business Discovery só lê contas profissionais (criador ou empresa).
 */
export function criarInstagram({ igUserId, token, fetch: f = globalThis.fetch }) {
  if (!igUserId || !token) throw new Error('Faltam IG_USER_ID e IG_ACCESS_TOKEN no .env');
  let chamadas = 0;

  async function get(caminho, params) {
    if (chamadas >= LIMITE_POR_RODADA) throw new Error('limite de chamadas da Meta nesta rodada');
    const url = new URL(`${BASE}/${caminho}`);
    for (const [k, v] of Object.entries({ ...params, access_token: token })) url.searchParams.set(k, String(v));
    chamadas++;
    const r = await f(url);
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok || corpo.error) throw new Error(corpo?.error?.message || `HTTP ${r.status}`);
    return corpo;
  }

  /** Perfil + posts até `desdeMs`, paginando de 50 em 50 (máx. `paginas`). */
  async function perfil(username, { desdeMs = 0, paginas = 6 } = {}) {
    let depois = null;
    let info = null;
    const midias = [];
    for (let p = 0; p < paginas; p++) {
      const edge = `media.limit(50)${depois ? `.after(${depois})` : ''}{${CAMPOS_MIDIA}}`;
      const r = await get(igUserId, {
        fields: `business_discovery.username(${username}){username,name,followers_count,media_count,${edge}}`,
      });
      const bd = r.business_discovery;
      info ??= bd;
      const lote = bd?.media?.data || [];
      midias.push(...lote);
      depois = bd?.media?.paging?.cursors?.after;
      const maisVelho = lote.length ? Date.parse(lote[lote.length - 1].timestamp) : 0;
      if (!depois || !lote.length || maisVelho < desdeMs) break;
    }
    return { ...info, midias };
  }

  async function seguidores(username) {
    const r = await get(igUserId, { fields: `business_discovery.username(${username}){username,followers_count}` });
    return r.business_discovery?.followers_count ?? null;
  }

  /** Top posts de uma hashtag (precisa do recurso "Instagram Public Content Access" no app). */
  async function hashtag(tag) {
    const busca = await get('ig_hashtag_search', { user_id: igUserId, q: tag.replace(/^#/, '') });
    const id = busca.data?.[0]?.id;
    if (!id) return [];
    const r = await get(`${id}/top_media`, {
      user_id: igUserId,
      limit: 50,
      fields: 'id,caption,comments_count,like_count,media_type,permalink,timestamp,media_url',
    });
    return r.data || [];
  }

  /**
   * Roda o processo inteiro de uma trilha.
   * @param {object} memoria  { perfis: { username: { seguidores, origem, descobertoEm } } } — persiste entre dias
   */
  async function minerar(trilha, { agoraData = new Date(), log = () => {}, memoria = { perfis: {} } } = {}) {
    const cfg = trilha.instagram || {};
    const desdeMs = agoraData.getTime() - (cfg.janelaDias ?? 90) * 86400000;
    const minSeg = cfg.minimoSeguidores ?? 50000;
    const rodadas = cfg.rodadasDeAmpliacao ?? 2;
    const maxNovos = cfg.maxNovosPorRodada ?? 10;
    const norm = (u) => u.replace(/^@/, '').toLowerCase();

    const semente = (cfg.perfis || []).map(norm);
    for (const u of semente) memoria.perfis[u] ??= { origem: 'semente', descobertoEm: null, seguidores: null };
    const candidatos = [];
    const lidos = new Set();
    const descobertosHoje = [];
    let fila = Object.keys(memoria.perfis);

    for (let rodada = 0; rodada <= rodadas && fila.length; rodada++) {
      const citados = new Map();
      for (const username of fila) {
        if (lidos.has(username)) continue;
        lidos.add(username);
        let p;
        try {
          p = await perfil(username, { desdeMs });
        } catch (e) {
          log(`  @${username}: ${e.message}`);
          if (/limite de chamadas/.test(e.message)) return fim();
          continue;
        }
        memoria.perfis[username] = { ...memoria.perfis[username], seguidores: p.followers_count ?? null, lidoEm: agoraData.toISOString() };
        const todos = p.midias.map((m) => normalizarMidia(m, p));
        for (const m of todos) {
          if (Date.parse(m.publicadoEm) < desdeMs) continue;
          for (const h of arrobas(m.descricao)) if (!memoria.perfis[h]) citados.set(h, (citados.get(h) || 0) + 1);
          const outros = todos.filter((o) => o.id !== m.id).map((o) => o.comentarios);
          candidatos.push({
            ...m,
            metrica: m.comentarios,
            metricaNome: 'comentários',
            medianaCanal: mediana(outros),
            amostraCanal: outros.length,
            outlier: outlier(m.comentarios, outros),
          });
        }
      }
      if (rodada === rodadas) break;
      // Ampliação: os @ mais citados, só se forem perfis grandes.
      fila = [];
      const ordem = [...citados.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
      for (const h of ordem) {
        if (fila.length >= maxNovos) break;
        let seg = null;
        try {
          seg = await seguidores(h);
        } catch {
          continue; // conta pessoal, inexistente ou privada
        }
        if (seg !== null && seg >= minSeg) {
          memoria.perfis[h] = { origem: `citado (rodada ${rodada + 1})`, descobertoEm: agoraData.toISOString(), seguidores: seg };
          descobertosHoje.push({ username: h, seguidores: seg });
          fila.push(h);
        }
      }
    }

    for (const tag of cfg.hashtags || []) {
      try {
        for (const m of await hashtag(tag)) {
          if (Date.parse(m.timestamp) < desdeMs) continue;
          candidatos.push({ ...normalizarMidia(m, null), canal: `#${tag.replace(/^#/, '')}`, metrica: m.comments_count ?? 0, metricaNome: 'comentários', outlier: null });
        }
      } catch (e) {
        log(`  #${tag}: ${e.message}`);
        break;
      }
    }
    return fim();

    function fim() {
      return { candidatos, descobertosHoje, perfisLidos: lidos.size, chamadas };
    }
  }

  return { perfil, seguidores, hashtag, minerar, chamadas: () => chamadas };
}

/** @menções numa legenda, sem e-mails. */
export function arrobas(texto) {
  const out = new Set();
  for (const m of String(texto || '').matchAll(/(?:^|[^\w@.])@([a-z0-9._]{2,30})/gi)) {
    out.add(m[1].replace(/\.+$/, '').toLowerCase());
  }
  return [...out];
}

/**
 * Seleção do Instagram: COMENTÁRIOS primeiro. Corte absoluto, maior pro menor.
 * Empate: o de outlier maior (surpreendeu mais o próprio público).
 */
export function selecionarPorComentarios(candidatos, { minimoComentarios = 10000, soVideo = false, jaUsados = new Set() } = {}) {
  const vistos = new Set();
  return candidatos
    .filter((c) => c.comentarios >= minimoComentarios)
    .filter((c) => !soVideo || c.ehVideo)
    .filter((c) => !jaUsados.has(c.id))
    .filter((c) => (vistos.has(c.id) ? false : vistos.add(c.id)))
    .sort((a, b) => b.comentarios - a.comentarios || (b.outlier || 0) - (a.outlier || 0));
}

export function normalizarMidia(m, perfil) {
  const ehVideo = m.media_type === 'VIDEO' || m.media_product_type === 'REELS';
  return {
    id: `ig:${m.id}`,
    fonte: 'instagram',
    url: m.permalink,
    titulo: (m.caption || '').split('\n')[0].slice(0, 120),
    descricao: m.caption || '',
    canal: perfil?.username ? `@${perfil.username}` : '',
    canalId: perfil?.username || '',
    seguidores: perfil?.followers_count ?? null,
    publicadoEm: m.timestamp,
    ehVideo,
    midiaUrl: m.media_url || null,
    segundos: null,
    views: m.view_count ?? null,
    curtidas: m.like_count ?? null,
    comentarios: m.comments_count ?? 0,
  };
}
