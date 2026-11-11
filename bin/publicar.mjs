#!/usr/bin/env node
/**
 * Gera os sites a partir de conteudo/ e envia para o GitHub. A Vercel publica sozinha
 * (um projeto por site, com Root Directory em sites/advocacia e sites/ia).
 *   node bin/publicar.mjs            → gera e envia
 *   node bin/publicar.mjs --so-gerar → só gera (para olhar antes)
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RAIZ, lerJson, log } from '../src/util.mjs';
import { gerarSites } from '../src/sites.mjs';

const cfg = lerJson(path.join(RAIZ, 'config', 'sites.json'), { sites: [] });
const gerados = gerarSites(RAIZ, cfg);
log(`${gerados.length} página(s) gerada(s) em sites/`);

if (!process.argv.includes('--so-gerar')) {
  const git = (...a) => execFileSync('git', a, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  git('add', 'conteudo', 'sites');
  if (!git('status', '--porcelain', 'conteudo', 'sites').trim()) {
    log('Nada novo para publicar.');
  } else {
    git('commit', '-m', `Publica materiais (${new Date().toISOString().slice(0, 10)})`);
    git('push');
    log('✔ Enviado. A Vercel publica em cerca de 1 minuto.');
  }
}
