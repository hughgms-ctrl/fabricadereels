import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Lê o .env da raiz sem dependência externa. Não sobrescreve o que já está no ambiente. */
export function carregarEnv(arquivo = path.join(RAIZ, '.env')) {
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || linha.trim().startsWith('#')) continue;
    let valor = m[2];
    if (/^".*"$|^'.*'$/.test(valor)) valor = valor.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}

export function mediana(numeros) {
  const v = numeros.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export function lerJson(arquivo, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return padrao;
  }
}

export function gravarJson(arquivo, dado) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dado, null, 2));
  fs.renameSync(tmp, arquivo);
}

/** Data local no formato AAAA-MM-DD (fuso de São Paulo, independente do celular). */
export function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

export function diasAtras(dias, agora = new Date()) {
  return new Date(agora.getTime() - dias * 86400000);
}

/** "PT1M5S" → 65 */
export function duracaoIsoEmSegundos(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

export function contarPalavras(texto) {
  return (texto || '').trim().split(/\s+/).filter(Boolean).length;
}

export function log(...partes) {
  const hora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[${hora}]`, ...partes);
}
