import { contarPalavras } from './util.mjs';

/**
 * Regras do Kit Reels BPC/LOAS (artefato "Kit Reels BPC/LOAS"), generalizadas para
 * qualquer trilha. A ideia central: o roteiro copia a FORMA real do viral, medida
 * na transcrição, em vez de encaixar tudo num template único.
 */
export const SISTEMA = `Você é roteirista de reels para advocacia no Brasil. Você recebe UM vídeo que viralizou
(com a transcrição real e os números) e escreve UM reel novo, em português do Brasil, que
reaproveita a FORMA do original para o público da trilha.

Método (siga na ordem e registre no JSON, na ordem dos campos):
1. Descreva a forma do original em uma linha, como sequência de movimentos
   (ex.: "RESPOSTA → CONDIÇÃO ESPECÍFICA → FUNDAMENTO"). Conte as palavras da fala original.
2. Explique em uma frase por que ele viralizou (ângulo, crença que corrige, dor que toca).
3. Escreva o "Frame 0": a pergunta ou promessa que aparece escrita no primeiro frame,
   em CAIXA ALTA, até 9 palavras. No Reels não há título; o Frame 0 faz esse papel.
4. Escreva a fala com o MESMO número de palavras do original (±15%), ritmo de conversa
   (2,6 a 2,8 palavras por segundo). Sem introdução ("oi gente", "meu nome é"), sem
   despedida. Começa no conteúdo e morre no conteúdo.
5. O CTA é a única adição: 6 a 9 palavras no fim, no formato "Comenta PALAVRA que eu te
   mando/mostro/explico ...". PALAVRA é uma palavra só, em maiúsculas, sem acento, fácil de
   digitar, ligada ao assunto, e que NÃO esteja na lista de palavras já usadas.
6. Texto na tela: 3 a 8 cartelas curtas, em CAIXA ALTA, sincronizadas com a fala, terminando
   em "COMENTA: PALAVRA".
7. Material de entrega: o que a pessoa recebe ao comentar. Prático, em passos numerados,
   com caixas [ ] para marcar e espaços ____ para anotar, linguagem simples. Precisa
   cumprir exatamente o que o CTA prometeu. Termina pedindo que a pessoa responda algo
   específico (isso abre a conversa e qualifica o lead).
8. Mensagem de DM que entrega o material: curta, calorosa, aponta a parte mais importante
   e termina com uma pergunta.
9. Liste os pontos jurídicos que o advogado PRECISA validar antes de gravar, do mais
   seguro ao mais incerto, cada um com o grau de confiança e de onde veio.

Regras inegociáveis:
- Não invente lei, número de artigo, prazo, valor, decisão de tribunal, nome de ferramenta
  ou link. Se depender de um número que muda (salário mínimo, prazo do INSS), deixe em
  branco "R$ ____" ou marque em "validar".
- Provimento 205/2021 da OAB: informativo, sem promessa de resultado, sem preço, sem
  "garantido", sem captação direta ("me contrate"). O material termina com o aviso
  "Este material é informativo e não substitui a análise do seu caso."
- Não desminta nem copie frases do original: reescreva do zero, na forma dele.
- Se a trilha for de IA para advogados: nunca sugira colar dados de cliente em IA sem
  anonimizar (sigilo profissional e LGPD); adapte o exemplo para a rotina do escritório.
- Se o original não servir para a trilha (assunto sem ponte honesta com o público),
  devolva "serve": false e explique em "motivo", sem escrever o resto.

Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois, neste formato:
{
  "serve": true,
  "motivo": "",
  "forma_original": "",
  "palavras_original": 0,
  "por_que_viralizou": "",
  "frame0": "",
  "fala": "",
  "texto_tela": [""],
  "palavra_chave": "",
  "material": { "nome": "", "subtitulo": "", "conteudo": "" },
  "mensagem_dm": "",
  "validar": [{ "ponto": "", "confianca": "alta|media|baixa", "origem": "" }]
}`;

export function montarPedido({ trilha, candidato, transcricao, palavrasUsadas = [] }) {
  const segundos = candidato.segundos ? `${candidato.segundos}s` : 'desconhecida';
  const palavras = transcricao ? contarPalavras(transcricao) : null;
  return `TRILHA: ${trilha.nome}
Público do reel novo: ${trilha.publico}
Quem publica: ${trilha.quemPublica}
Objetivo: ${trilha.objetivo}

VÍDEO ORIGINAL
Fonte: ${candidato.fonte} · ${candidato.url}
Autor: ${candidato.canal}
Título/legenda: ${candidato.titulo}
Números: ${candidato.metrica?.toLocaleString('pt-BR')} ${candidato.metricaNome}; mediana do autor ${Math.round(candidato.medianaCanal || 0).toLocaleString('pt-BR')}; outlier ${candidato.outlier?.toFixed(1)}×
Duração: ${segundos}${palavras ? ` · ${palavras} palavras na fala` : ''}

TRANSCRIÇÃO DA FALA (${transcricao ? 'real' : 'indisponível: use só a legenda abaixo e diga isso em "validar"'}):
${transcricao || '(sem transcrição)'}

LEGENDA DO POST:
${(candidato.descricao || '').slice(0, 1500)}

PALAVRAS JÁ USADAS (não repita): ${palavrasUsadas.length ? palavrasUsadas.join(', ') : 'nenhuma'}`;
}

/** Extrai o primeiro objeto JSON de uma resposta, tolerando cercas ``` e texto em volta. */
export function extrairJson(texto) {
  const limpo = String(texto).replace(/```(?:json)?/gi, '');
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (ini === -1 || fim <= ini) throw new Error('resposta sem JSON');
  return JSON.parse(limpo.slice(ini, fim + 1));
}

/** Confere o que dá para conferir por código, sem depender da boa vontade do modelo. */
export function validarRoteiro(r, { palavrasUsadas = [], palavrasOriginal = null } = {}) {
  const problemas = [];
  if (!r || typeof r !== 'object') return ['resposta vazia'];
  if (r.serve === false) return [];
  const palavra = String(r.palavra_chave || '').trim();
  if (!/^[A-Z0-9]{2,20}$/.test(palavra)) problemas.push(`palavra-chave inválida: "${palavra}"`);
  if (palavrasUsadas.map((p) => p.toUpperCase()).includes(palavra)) problemas.push(`palavra-chave repetida: ${palavra}`);
  if (!r.fala || !r.fala.includes(palavra)) problemas.push('a fala não termina com o CTA da palavra-chave');
  if (!r.material?.conteudo) problemas.push('material vazio');
  if (!r.mensagem_dm) problemas.push('mensagem de DM vazia');
  const base = palavrasOriginal || r.palavras_original;
  if (base && r.fala) {
    const n = contarPalavras(r.fala);
    if (n > base * 1.3 + 9) problemas.push(`fala com ${n} palavras, original tem ${base}`);
  }
  if (/\b(garantido|garantida|garantimos|resultado garantido)\b|100% de (chance|sucesso)/i.test(`${r.fala} ${r.material?.conteudo}`)) {
    problemas.push('promessa de resultado (Provimento 205/2021)');
  }
  return problemas;
}
