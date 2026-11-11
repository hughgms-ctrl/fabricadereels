import { mediana } from './util.mjs';

/**
 * Outlier = desempenho do post ÷ mediana dos posts recentes do mesmo canal/perfil.
 * Um vídeo com 500 mil views num canal que costuma ter 3 mil vale mais
 * que 1 milhão num canal que sempre tem 1 milhão.
 */
export function outlier(valor, valoresDoCanal) {
  const base = mediana(valoresDoCanal);
  if (!base || base <= 0 || !Number.isFinite(valor)) return null;
  return valor / base;
}

/**
 * Filtra e ordena os candidatos de uma trilha.
 * @param {Array<{id:string, metrica:number, outlier:number|null}>} candidatos
 * @param {{minimoOutlier:number, minimoMetrica:number, jaUsados:Set<string>}} regras
 */
export function ranquear(candidatos, { minimoOutlier = 3, minimoMetrica = 0, jaUsados = new Set() } = {}) {
  const vistos = new Set();
  return candidatos
    .filter((c) => c.outlier !== null && c.outlier >= minimoOutlier)
    .filter((c) => c.metrica >= minimoMetrica)
    .filter((c) => !jaUsados.has(c.id))
    .filter((c) => (vistos.has(c.id) ? false : vistos.add(c.id)))
    .sort((a, b) => b.outlier - a.outlier || b.metrica - a.metrica);
}

/** Escolhe N sem repetir canal, para o dia não sair com três vídeos do mesmo autor. */
export function escolherVariados(ranqueados, n) {
  const escolhidos = [];
  const canais = new Set();
  for (const c of ranqueados) {
    if (escolhidos.length >= n) break;
    if (canais.has(c.canal)) continue;
    canais.add(c.canal);
    escolhidos.push(c);
  }
  return escolhidos;
}
