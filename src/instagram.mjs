import { outlier } from './outlier.mjs';
import { mediana } from './util.mjs';

/** Versão fixa da Graph API. Nunca "latest": mudança de versão é decisão consciente. */
export const GRAPH_VERSAO = 'v21.0';
const BASE = `https://graph.facebook.com/${GRAPH_VERSAO}`;

const CAMPOS_MIDIA = [
  'id', 'caption', 'comments_count', 'like_count', 'media_type',
  'media_product_type', 'permalink', 'timestamp', 'media_url',
].join(',');

/**
 * Business Discovery: lê posts públicos de OUTRAS contas profissionais (criador ou empresa)
 * usando o seu próprio Instagram profissional. Grátis, limite de ~200 chamadas por hora.
 * Contas pessoais não aparecem — para essas, a reserva é o Apify.
 */
export function criarInstagram({ igUserId, token, fetch: f = globalThis.fetch }) {
  if (!igUserId || !token) throw new Error('Faltam IG_USER_ID e IG_ACCESS_TOKEN no .env');

  async function perfil(username, limite = 30) {
    const url = new URL(`${BASE}/${igUserId}`);
    url.searchParams.set(
      'fields',
      `business_discovery.username(${username}){username,followers_count,media_count,media.limit(${limite}){${CAMPOS_MIDIA}}}`,
    );
    url.searchParams.set('access_token', token);
    const r = await f(url);
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok || corpo.error) {
      throw new Error(`Instagram @${username}: ${corpo?.error?.message || r.status}`);
    }
    return corpo.business_discovery;
  }

  async function minerar(trilha, { agoraData = new Date(), log = () => {} } = {}) {
    const perfis = trilha.instagram?.perfis || [];
    const [minDias, maxDias] = trilha.youtube?.janelaDias || [3, 60];
    const depois = agoraData.getTime() - maxDias * 86400000;
    const antes = agoraData.getTime() - minDias * 86400000;
    const candidatos = [];
    for (const username of perfis) {
      let bd;
      try {
        bd = await perfil(username);
      } catch (e) {
        log(`  ${e.message}`);
        continue;
      }
      const midias = (bd?.media?.data || []).map((m) => normalizarMidia(m, bd));
      for (const m of midias) {
        const t = Date.parse(m.publicadoEm);
        if (!(t >= depois && t <= antes)) continue;
        const outros = midias.filter((o) => o.id !== m.id).map((o) => o.comentarios);
        if (outros.length < 5) continue;
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
    return candidatos;
  }

  return { perfil, minerar };
}

export function normalizarMidia(m, bd) {
  const ehVideo = m.media_type === 'VIDEO' || m.media_product_type === 'REELS';
  return {
    id: `ig:${m.id}`,
    fonte: 'instagram',
    url: m.permalink,
    titulo: (m.caption || '').split('\n')[0].slice(0, 120),
    descricao: m.caption || '',
    canal: `@${bd?.username || ''}`,
    canalId: bd?.username || '',
    seguidores: bd?.followers_count ?? null,
    publicadoEm: m.timestamp,
    ehVideo,
    midiaUrl: m.media_url || null,
    segundos: null,
    views: null,
    curtidas: m.like_count ?? null,
    comentarios: m.comments_count ?? 0,
  };
}
