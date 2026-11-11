import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/** Executa um programa e devolve stdout. Separado para os testes trocarem. */
export async function executar(bin, args, opcoes = {}) {
  const { stdout } = await execFileP(bin, args, { maxBuffer: 50 * 1024 * 1024, timeout: 10 * 60 * 1000, ...opcoes });
  return stdout;
}

/**
 * Converte VTT em texto corrido. A legenda automática do YouTube repete cada frase
 * enquanto ela "rola" na tela; aqui sobra uma linha por fala.
 */
export function vttParaTexto(vtt) {
  const linhas = [];
  for (const bruta of vtt.split(/\r?\n/)) {
    const l = bruta
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim();
    if (!l || l === 'WEBVTT' || /^(Kind|Language|NOTE)\b/.test(l) || /-->/.test(l) || /^\d+$/.test(l)) continue;
    if (/^\[(música|music|aplausos|applause)\]$/i.test(l)) continue;
    const ultima = linhas[linhas.length - 1];
    if (ultima === l) continue;
    if (ultima && l.startsWith(ultima)) {
      linhas[linhas.length - 1] = l;
      continue;
    }
    if (ultima && ultima.endsWith(l)) continue;
    linhas.push(l);
  }
  return linhas.join(' ').replace(/\s+/g, ' ').trim();
}

/** YouTube: legenda (manual ou automática) via yt-dlp, sem baixar o vídeo. Custo zero. */
export async function legendaYoutube(url, { idiomas = 'pt.*,pt,en.*,en', run = executar } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leg-'));
  try {
    await run('yt-dlp', [
      '--skip-download', '--write-subs', '--write-auto-subs',
      '--sub-langs', idiomas, '--sub-format', 'vtt',
      '-o', path.join(dir, 'v.%(ext)s'), url,
    ]);
    const arquivos = fs.readdirSync(dir).filter((a) => a.endsWith('.vtt'));
    if (!arquivos.length) return null;
    // Prefere a legenda manual (sem "orig"/auto) e português.
    arquivos.sort((a, b) => pesoLegenda(a) - pesoLegenda(b));
    const texto = vttParaTexto(fs.readFileSync(path.join(dir, arquivos[0]), 'utf8'));
    return texto ? { texto, origem: `legenda ${arquivos[0].split('.').slice(1, -1).join('.')}` } : null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function pesoLegenda(nome) {
  let p = 0;
  if (!/\.pt/.test(nome)) p += 2;
  if (/orig/.test(nome)) p += 1;
  return p;
}

/**
 * Whisper local (whisper.cpp) a partir de uma URL de vídeo: baixa o áudio, converte
 * para 16 kHz mono e transcreve no próprio celular.
 */
export async function whisperLocal(url, { bin, modelo, idioma = 'auto', run = executar }) {
  if (!fs.existsSync(modelo)) throw new Error(`Modelo do Whisper não encontrado em ${modelo}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-'));
  try {
    await run('yt-dlp', ['-f', 'bestaudio/best', '-o', path.join(dir, 'a.%(ext)s'), url]);
    const audio = fs.readdirSync(dir).find((a) => a.startsWith('a.'));
    if (!audio) throw new Error('não consegui baixar o áudio');
    const wav = path.join(dir, 'a16.wav');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, audio), '-ar', '16000', '-ac', '1', wav]);
    await run(bin, ['-m', modelo, '-f', wav, '-l', idioma, '-otxt', '-of', path.join(dir, 'saida'), '-np']);
    const texto = fs.readFileSync(path.join(dir, 'saida.txt'), 'utf8').replace(/\s+/g, ' ').trim();
    return texto ? { texto, origem: 'whisper local' } : null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Escolhe o caminho mais barato que funcionar para cada fonte. */
export async function transcrever(candidato, env, deps = {}) {
  const run = deps.run || executar;
  if (candidato.fonte === 'youtube') {
    const leg = await legendaYoutube(candidato.url, { run }).catch(() => null);
    if (leg) return leg;
  }
  if (candidato.fonte === 'instagram' && !candidato.ehVideo) return null;
  if ((env.TRANSCRICAO_REELS || 'whisper') !== 'whisper') return null;
  return whisperLocal(candidato.midiaUrl || candidato.url, {
    bin: env.WHISPER_CPP_BIN || 'whisper-cli',
    modelo: path.resolve(deps.raiz || '.', env.WHISPER_MODELO || 'modelos/ggml-base.bin'),
    run,
  });
}
