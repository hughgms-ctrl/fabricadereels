#!/usr/bin/env node
/**
 * Aprova um material para ir ao site de entrega.
 *   node bin/aprovar.mjs CASA            → acha o roteiro mais recente com a palavra CASA
 *   node bin/aprovar.mjs CASA --publicar → aprova, gera os sites e envia para o GitHub
 *   node bin/aprovar.mjs --lista         → mostra o que está esperando aprovação
 *
 * Antes de aprovar, leia a lista "Validar antes de gravar" do roteiro. Se quiser mudar o
 * texto, edite conteudo/<site>/<palavra>.json depois e rode `node bin/publicar.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, lerJson, gravarJson, log, carregarEnv } from '../src/util.mjs';
import { slug } from '../src/sites.mjs';
import { criarAvisos, msgPublicacao } from '../src/avisos.mjs';

const args = process.argv.slice(2);
const sites = lerJson(path.join(RAIZ, 'config', 'sites.json'), { sites: [] }).sites;
const siteDaTrilha = (t) => sites.find((s) => s.trilhas.includes(t));

function roteirosSalvos() {
  const base = path.join(RAIZ, 'data', 'dias');
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const dia of fs.readdirSync(base).sort().reverse()) {
    for (const arq of fs.readdirSync(path.join(base, dia)).filter((a) => a.endsWith('.json'))) {
      const j = lerJson(path.join(base, dia, arq), { itens: [] });
      for (const it of j.itens || []) {
        if (it.roteiro?.serve !== false && it.roteiro?.palavra_chave) out.push({ dia, trilha: j.trilha, ...it });
      }
    }
  }
  return out;
}

const jaAprovado = (s, palavra) => fs.existsSync(path.join(RAIZ, 'conteudo', s.id, `${slug(palavra)}.json`));

if (args.includes('--lista') || !args.length) {
  const pendentes = roteirosSalvos().filter((r) => {
    const s = siteDaTrilha(r.trilha);
    return s && !jaAprovado(s, r.roteiro.palavra_chave);
  });
  if (!pendentes.length) log('Nada esperando aprovação.');
  for (const r of pendentes) {
    console.log(`${r.dia}  ${r.roteiro.palavra_chave.padEnd(12)} ${r.trilha.padEnd(16)} ${r.roteiro.material?.nome || ''}`);
  }
  process.exit(0);
}

const palavra = args.find((a) => !a.startsWith('--')).toUpperCase();
const achado = roteirosSalvos().find((r) => r.roteiro.palavra_chave.toUpperCase() === palavra);
if (!achado) {
  log(`Não achei roteiro com a palavra ${palavra}. Veja: node bin/aprovar.mjs --lista`);
  process.exit(1);
}
const site = siteDaTrilha(achado.trilha);
if (!site) {
  log(`A trilha ${achado.trilha} não está ligada a nenhum site em config/sites.json`);
  process.exit(1);
}
const r = achado.roteiro;
const arquivo = path.join(RAIZ, 'conteudo', site.id, `${slug(palavra)}.json`);
gravarJson(arquivo, {
  palavra,
  nome: r.material?.nome || palavra,
  subtitulo: r.material?.subtitulo || '',
  conteudo: r.material?.conteudo || '',
  mensagemDm: r.mensagem_dm || '',
  referencia: achado.candidato?.url || null,
  trilha: achado.trilha,
  aprovadoEm: new Date().toISOString(),
});
const url = site.dominio ? `${site.dominio.replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://')}/${slug(palavra)}/` : null;
log(`✔ ${palavra} aprovado em ${path.relative(RAIZ, arquivo)}`);
log(`  Link para a DM: ${url || `<domínio do site ${site.id}>/${slug(palavra)}/ (preencha "dominio" em config/sites.json)`}`);

if (args.includes('--publicar')) {
  await import('./publicar.mjs');
  carregarEnv();
  await criarAvisos({ raiz: RAIZ, env: process.env, log }).enviar(
    achado.trilha,
    'publicacao',
    msgPublicacao({ palavra, url, mensagemDm: r.mensagem_dm || '', site: site.titulo }),
  );
}
