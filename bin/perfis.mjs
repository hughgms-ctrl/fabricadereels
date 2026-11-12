#!/usr/bin/env node
/**
 * Lista de perfis do Instagram de cada trilha, mexida pelo Telegram.
 *   node bin/perfis.mjs listar   previdenciario
 *   node bin/perfis.mjs adicionar previdenciario @fulano
 *   node bin/perfis.mjs tirar    ia-advogados @ciclano
 * Fica em data/memoria-<trilha>.json (não mexe no config/, que vem do GitHub).
 */
import path from 'node:path';
import { RAIZ, lerJson, gravarJson, log } from '../src/util.mjs';

const [acao, trilhaId, perfilBruto] = process.argv.slice(2);
const { trilhas } = lerJson(path.join(RAIZ, 'config', 'trilhas.json'), { trilhas: [] });
const trilha = trilhas.find((t) => t.id === trilhaId);
if (!trilha || !['listar', 'adicionar', 'tirar', 'priorizar', 'despriorizar'].includes(acao)) {
  log(`Uso: node bin/perfis.mjs <listar|adicionar|tirar|priorizar|despriorizar> <${trilhas.map((t) => t.id).join('|')}> [@perfil]`);
  process.exit(1);
}
const arq = path.join(RAIZ, 'data', `memoria-${trilha.id}.json`);
const memoria = lerJson(arq, { perfis: {} });
const perfil = String(perfilBruto || '').replace(/^@/, '').toLowerCase().trim();
const semente = new Set((trilha.instagram?.perfis || []).map((p) => p.toLowerCase()));

if (acao === 'listar') {
  const todos = new Set([...semente, ...Object.keys(memoria.perfis)]);
  const ativos = [...todos].filter((u) => !memoria.perfis[u]?.removido).sort();
  const tirados = [...todos].filter((u) => memoria.perfis[u]?.removido).sort();
  console.log(`${trilha.nome}: ${ativos.length} perfis ativos`);
  const prioritarios = new Set(
    [...(trilha.instagram?.prioritarios || []).map((p) => p.toLowerCase()), ...Object.keys(memoria.perfis).filter((u) => memoria.perfis[u]?.prioritario === true)]
      .filter((u) => memoria.perfis[u]?.prioritario !== false),
  );
  for (const u of ativos.sort((a, b) => prioritarios.has(b) - prioritarios.has(a))) {
    const m = memoria.perfis[u] || {};
    console.log(`  ${prioritarios.has(u) ? '⭐' : ' '} @${u}${m.seguidores ? ` · ${m.seguidores.toLocaleString('pt-BR')} seguidores` : ''}${m.origem && m.origem !== 'semente' ? ` · ${m.origem}` : ''}`);
  }
  if (tirados.length) console.log(`Tirados: ${tirados.map((u) => `@${u}`).join(', ')}`);
  process.exit(0);
}

if (!/^[a-z0-9._]{2,30}$/.test(perfil)) {
  log(`Perfil inválido: "${perfilBruto}"`);
  process.exit(1);
}
if (acao === 'priorizar') {
  memoria.perfis[perfil] = { ...(memoria.perfis[perfil] || { origem: 'prioritário (Telegram)' }), removido: false, prioritario: true };
  log(`✔ ⭐ @${perfil} é prioritário em ${trilha.nome}: lido todo dia, corte de comentários menor e no topo das Pautas`);
} else if (acao === 'despriorizar') {
  memoria.perfis[perfil] = { ...(memoria.perfis[perfil] || {}), prioritario: false };
  log(`✔ @${perfil} volta ao rodízio normal em ${trilha.nome}`);
} else if (acao === 'adicionar') {
  memoria.perfis[perfil] = { ...(memoria.perfis[perfil] || {}), origem: 'adicionado no Telegram', removido: false, descobertoEm: new Date().toISOString() };
  log(`✔ @${perfil} entra no próximo mapeamento de ${trilha.nome}`);
} else {
  memoria.perfis[perfil] = { ...(memoria.perfis[perfil] || {}), removido: true };
  log(`✔ @${perfil} saiu de ${trilha.nome} (não volta nem se for citado de novo)`);
}
gravarJson(arq, memoria);
