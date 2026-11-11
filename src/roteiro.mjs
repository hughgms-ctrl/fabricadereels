import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SISTEMA, montarPedido, extrairJson, validarRoteiro } from './prompts.mjs';
import { contarPalavras } from './util.mjs';

const LIMITE_MS = 10 * 60 * 1000;

function rodar(bin, args, entrada, cwd) {
  return new Promise((resolve, reject) => {
    const filho = spawn(bin, args, { cwd });
    let saida = '';
    let erro = '';
    const relogio = setTimeout(() => {
      filho.kill();
      reject(new Error('o Claude Code passou de 10 minutos sem responder'));
    }, LIMITE_MS);
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (erro += d));
    filho.on('error', (e) => {
      clearTimeout(relogio);
      reject(new Error(`não consegui rodar "${bin}": ${e.message}`));
    });
    filho.on('close', (codigo) => {
      clearTimeout(relogio);
      resolve({ codigo, saida, erro });
    });
    filho.stdin.end(entrada);
  });
}

/**
 * Chama o Claude Code em modo não interativo (usa a assinatura de quem está logado no
 * Termux, sem chave de API). Roda numa pasta vazia, sem ferramentas, sem MCP e sem
 * configurações de projeto: só o pedido entra.
 */
export async function chamarClaude(sistema, usuario, { bin = 'claude', modelo } = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'roteiro-'));
  try {
    const arqSistema = path.join(pasta, 'sistema.txt');
    fs.writeFileSync(arqSistema, sistema);
    const args = [
      '-p', '--output-format', 'json', '--no-session-persistence',
      '--setting-sources', '', '--strict-mcp-config',
      '--system-prompt-file', arqSistema, '--tools', '',
      ...(modelo ? ['--model', modelo] : []),
    ];
    const r = await rodar(bin, args, usuario, pasta);
    let res = null;
    try {
      res = JSON.parse(r.saida);
    } catch {
      /* cai no erro abaixo */
    }
    if (!res || r.codigo !== 0 || res.is_error) {
      const detalhe = (res?.result || r.erro || r.saida || '').trim().slice(0, 300);
      if (/log ?in|auth|credential/i.test(detalhe)) {
        throw new Error('o Claude Code não está logado no Termux: rode `claude` uma vez e faça login');
      }
      throw new Error(`o Claude Code falhou: ${detalhe || `código ${r.codigo}`}`);
    }
    return res.result || '';
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

/**
 * Escreve o roteiro de um candidato. Se a conferência por código achar problema,
 * devolve a lista para o Claude corrigir uma vez.
 */
export async function escreverRoteiro({ trilha, candidato, transcricao, palavrasUsadas, env, chamar = chamarClaude }) {
  const opcoes = { bin: env.CLAUDE_BIN || 'claude', modelo: env.CLAUDE_MODELO || undefined };
  const pedido = montarPedido({ trilha, candidato, transcricao, palavrasUsadas });
  const palavrasOriginal = transcricao ? contarPalavras(transcricao) : null;

  let roteiro = extrairJson(await chamar(SISTEMA, pedido, opcoes));
  let problemas = validarRoteiro(roteiro, { palavrasUsadas, palavrasOriginal });
  if (problemas.length) {
    const correcao = `${pedido}\n\nSUA RESPOSTA ANTERIOR:\n${JSON.stringify(roteiro)}\n\nCORRIJA estes problemas e devolva o JSON completo:\n- ${problemas.join('\n- ')}`;
    roteiro = extrairJson(await chamar(SISTEMA, correcao, opcoes));
    problemas = validarRoteiro(roteiro, { palavrasUsadas, palavrasOriginal });
  }
  return { roteiro, problemas };
}
