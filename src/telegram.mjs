import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Envio para o Telegram pela API oficial de bots (grátis).
 *
 * A fábrica SÓ ENVIA (sendMessage / sendPhoto). Quem lê as mensagens do grupo é o Hermes:
 * se a fábrica também lesse (getUpdates), os dois disputariam as mensagens do mesmo bot
 * e o Hermes deixaria de responder.
 */

const LIMITE = 3800; // o Telegram aceita 4096 caracteres; sobra margem para as tags

export const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/**
 * Link de uma mensagem dentro de um tópico → destino.
 *   https://t.me/c/1234567890/5/10  → { chatId: '-1001234567890', threadId: 5 }   (tópico 5)
 *   https://t.me/c/1234567890/10    → { chatId: '-1001234567890', threadId: null } (tópico Geral)
 */
export function linkParaDestino(link) {
  const m = /t\.me\/c\/(\d+)\/(\d+)(?:\/(\d+))?/.exec(String(link || ''));
  if (!m) return null;
  return { chatId: `-100${m[1]}`, threadId: m[3] ? Number(m[2]) : null };
}

/** Token do bot: o do .env da fábrica ou, se não houver, o do Hermes (~/.hermes/.env). */
export function tokenDoBot(env = process.env, home = os.homedir()) {
  if (env.TELEGRAM_BOT_TOKEN) return env.TELEGRAM_BOT_TOKEN;
  try {
    const hermes = fs.readFileSync(path.join(home, '.hermes', '.env'), 'utf8');
    const m = /^\s*TELEGRAM_BOT_TOKEN\s*=\s*["']?([^"'\s]+)/m.exec(hermes);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Bloco de texto pré-formatado, quebrado em pedaços que cabem numa mensagem. */
export function pre(texto, max = LIMITE - 20) {
  const blocos = [];
  let atual = '';
  for (const linha of String(texto || '').split('\n')) {
    const l = esc(linha);
    if (atual && atual.length + l.length + 1 > max) {
      blocos.push(`<pre>${atual}</pre>`);
      atual = '';
    }
    atual += (atual ? '\n' : '') + l.slice(0, max);
  }
  if (atual) blocos.push(`<pre>${atual}</pre>`);
  return blocos;
}

/** Junta blocos (cada um com as tags completas) em mensagens de até LIMITE caracteres. */
export function empacotar(blocos, max = LIMITE) {
  const msgs = [];
  let atual = '';
  for (const b of blocos.flat().filter(Boolean)) {
    const pedacos = b.length > max ? cortarTexto(b, max) : [b];
    for (const p of pedacos) {
      if (atual && atual.length + p.length + 2 > max) {
        msgs.push(atual);
        atual = '';
      }
      atual += (atual ? '\n\n' : '') + p;
    }
  }
  if (atual) msgs.push(atual);
  return msgs;
}

function cortarTexto(b, max) {
  // Só para blocos sem tags abertas no meio (texto simples): corta em quebras de linha.
  const out = [];
  let atual = '';
  for (const linha of b.split('\n')) {
    if (atual && atual.length + linha.length + 1 > max) {
      out.push(atual);
      atual = '';
    }
    atual += (atual ? '\n' : '') + linha.slice(0, max);
  }
  if (atual) out.push(atual);
  return out;
}

export function criarTelegram({ token, fetch: f = globalThis.fetch }) {
  if (!token) throw new Error('Falta o token do bot do Telegram (TELEGRAM_BOT_TOKEN)');
  const base = `https://api.telegram.org/bot${token}`;

  async function chamar(metodo, corpo, { multipart = false } = {}) {
    const r = await f(`${base}/${metodo}`, multipart
      ? { method: 'POST', body: corpo }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description || r.status}`);
    return j.result;
  }

  const destinoCampos = (d) => ({ chat_id: d.chatId, ...(d.threadId ? { message_thread_id: d.threadId } : {}) });

  async function texto(destino, blocos) {
    for (const msg of empacotar(Array.isArray(blocos) ? blocos : [blocos])) {
      await chamar('sendMessage', { ...destinoCampos(destino), text: msg, parse_mode: 'HTML', disable_web_page_preview: true });
    }
  }

  async function foto(destino, arquivo, legenda = '') {
    const form = new FormData();
    for (const [k, v] of Object.entries(destinoCampos(destino))) form.append(k, String(v));
    if (legenda) {
      form.append('caption', legenda.slice(0, 1000));
      form.append('parse_mode', 'HTML');
    }
    form.append('photo', new Blob([fs.readFileSync(arquivo)], { type: 'image/jpeg' }), path.basename(arquivo));
    await chamar('sendPhoto', form, { multipart: true });
  }

  return { chamar, texto, foto, quemSou: () => chamar('getMe', {}) };
}
