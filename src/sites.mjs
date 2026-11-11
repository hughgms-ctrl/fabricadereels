import fs from 'node:fs';
import path from 'node:path';

/**
 * Gera os sites de entrega (HTML estático, sem dependência): uma página por material,
 * no endereço /<palavra>/, e uma página inicial em formato de blog com todos os materiais.
 * A Vercel publica de graça direto do repositório (um projeto por pasta em sites/).
 */

export const esc = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const slug = (palavra) =>
  String(palavra).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Converte o material em texto (formato do Kit: passos, caixas [ ], campos ____) em HTML.
 * Linhas de ═ e ─ viram respiro; título em CAIXA ALTA vira seção; [ ] vira caixa de marcar
 * que o leitor marca de verdade (fica salva no aparelho dele).
 */
export function materialEmHtml(texto) {
  const out = [];
  let paragrafo = [];
  const fechar = () => {
    if (paragrafo.length) out.push(`<p>${paragrafo.join(' ')}</p>`);
    paragrafo = [];
  };
  let n = 0;
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l || /^[═─=\-_*]{4,}$/.test(l)) {
      fechar();
      continue;
    }
    const caixa = /^(\[ ?\]|\( ?\))\s*(.*)$/.exec(l);
    if (caixa) {
      fechar();
      out.push(`<label class="marca"><input type="checkbox" data-i="${n++}"><span>${esc(caixa[2])}</span></label>`);
      continue;
    }
    if (/^(➜|→|👉)/.test(l)) {
      fechar();
      out.push(`<p class="anote">${esc(l.replace(/^(➜|→|👉)\s*/, ''))}</p>`);
      continue;
    }
    if (/^⚠️?/.test(l)) {
      fechar();
      out.push(`<p class="alerta">${esc(l.replace(/^⚠️?\s*/, ''))}</p>`);
      continue;
    }
    if (/\.{4,}|_{3,}/.test(l)) {
      fechar();
      const [rotulo, ...resto] = l.split(/\s*\.{3,}\s*/);
      const valor = resto.join(' ').replace(/_{3,}/g, '').trim();
      const so = rotulo.replace(/_{3,}/g, '').trim();
      out.push(`<p class="campo"><span>${esc(so)}</span><span class="preencher">${esc(valor)}</span></p>`);
      continue;
    }
    const letras = l.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letras.length >= 4 && letras === letras.toUpperCase() && l.length <= 80) {
      fechar();
      out.push(`<h2>${esc(l)}</h2>`);
      continue;
    }
    if (/^\d+\.\s/.test(l)) {
      fechar();
      out.push(`<p class="item">${esc(l)}</p>`);
      continue;
    }
    paragrafo.push(esc(l));
  }
  fechar();
  return out.join('\n');
}

function css(c) {
  return `:root{--fundo:${c.fundo};--sup:${c.superficie};--txt:${c.texto};--suave:${c.suave};--linha:${c.linha};--dest:${c.destaque};--dest2:${c.destaqueSuave}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fundo);color:var(--txt);font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif}
a{color:var(--dest)}main{max-width:720px;margin:0 auto;padding:28px 16px 80px}
.topo{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--dest);font-weight:700;margin:0 0 14px}
h1{font-size:clamp(30px,7vw,44px);line-height:1.08;letter-spacing:-.02em;margin:0 0 12px}
.sub{color:var(--suave);font-size:18px;margin:0 0 28px}
.cartao{background:var(--sup);border:1px solid var(--linha);border-radius:14px;padding:22px 20px;margin:0 0 18px}
h2{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--dest);margin:34px 0 10px}
h2:first-child{margin-top:0}
.marca{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--linha);cursor:pointer}
.marca input{width:22px;height:22px;margin:2px 0 0;accent-color:var(--dest);flex:none}
.marca input:checked+span{color:var(--suave);text-decoration:line-through}
.anote{background:var(--dest2);border-radius:8px;padding:10px 12px;font-weight:600}
.alerta{border-left:3px solid #C2410C;padding:6px 12px;background:rgba(194,65,12,.08);border-radius:0 8px 8px 0}
.campo{display:flex;gap:10px;align-items:flex-end;margin:10px 0}.campo span:first-child{flex:0 1 auto}
.preencher{flex:1 1 70px;min-width:70px;border-bottom:1.5px dashed var(--suave);text-align:right;font-weight:600;padding-bottom:2px}
.item{padding-left:4px}
.aviso{font-size:14px;color:var(--suave);border-top:1px solid var(--linha);padding-top:16px;margin-top:28px}
.botao{display:inline-block;background:var(--dest);color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px;border:0;font-size:16px;cursor:pointer;width:100%;text-align:center}
form{display:grid;gap:12px}input[type=text],input[type=email],input[type=tel]{width:100%;font:inherit;padding:13px 14px;border-radius:10px;border:1px solid var(--linha);background:var(--fundo);color:var(--txt)}
.lista{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.lista a{display:block;text-decoration:none;color:inherit}
.lista h3{margin:0 0 4px;font-size:21px;line-height:1.25}.lista p{margin:0;color:var(--suave)}
.palavra{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--dest);background:var(--dest2);border-radius:6px;padding:3px 8px;margin-bottom:10px}
.escondido{display:none}footer{margin-top:40px;font-size:14px;color:var(--suave)}`;
}

function casca({ site, titulo, descricao, corpo, raiz = '' }) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao)}">
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
<meta name="theme-color" content="${esc(site.cores.fundo)}">
<style>${css(site.cores)}</style></head>
<body><main>${corpo}
<footer><a href="${raiz}/">Todos os materiais</a> · ${esc(site.assinatura)}${site.instagram ? ` · <a href="https://www.instagram.com/${esc(site.instagram)}/">@${esc(site.instagram)}</a>` : ''}</footer>
</main></body></html>`;
}

/** Página de um material. Com webhookLead, o conteúdo abre depois do formulário. */
export function paginaMaterial(site, m) {
  const formulario = site.webhookLead
    ? `<section class="cartao" id="pedido"><h2>Receba o material</h2>
<form id="form"><input type="text" name="nome" placeholder="Seu nome" required autocomplete="name">
<input type="email" name="email" placeholder="Seu e-mail" required autocomplete="email">
<input type="tel" name="whatsapp" placeholder="WhatsApp com DDD" required autocomplete="tel">
<button class="botao" type="submit">Liberar o material</button></form></section>`
    : '';
  const whats = site.whatsapp
    ? `<p><a class="botao" href="https://wa.me/${esc(site.whatsapp.replace(/\D/g, ''))}?text=${encodeURIComponent(`Vim pelo material ${m.palavra}`)}">Tirar dúvida no WhatsApp</a></p>`
    : '';
  const corpo = `<p class="topo">${esc(site.titulo)}</p>
<span class="palavra">${esc(m.palavra)}</span>
<h1>${esc(m.nome)}</h1>
${m.subtitulo ? `<p class="sub">${esc(m.subtitulo)}</p>` : ''}
${formulario}
<article class="cartao${site.webhookLead ? ' escondido' : ''}" id="material">
${materialEmHtml(m.conteudo)}
<p class="aviso">${esc(site.aviso)}</p>
${whats}
</article>
<script>
(function(){
var k='m-${slug(m.palavra)}';
document.querySelectorAll('.marca input').forEach(function(c){
  try{c.checked=localStorage.getItem(k+c.dataset.i)==='1'}catch(e){}
  c.addEventListener('change',function(){try{localStorage.setItem(k+c.dataset.i,c.checked?'1':'0')}catch(e){}});
});
var f=document.getElementById('form');if(!f)return;
var abrir=function(){document.getElementById('pedido').classList.add('escondido');document.getElementById('material').classList.remove('escondido')};
try{if(localStorage.getItem(k+'-lead')==='1')abrir()}catch(e){}
f.addEventListener('submit',function(e){e.preventDefault();var d=Object.fromEntries(new FormData(f));
d.palavra=${JSON.stringify(m.palavra)};d.site=${JSON.stringify(site.id)};d.pagina=location.href;
fetch(${JSON.stringify(site.webhookLead || '')},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d),mode:'no-cors'}).catch(function(){});
try{localStorage.setItem(k+'-lead','1')}catch(e){}abrir();});
})();
</script>`;
  return casca({ site, titulo: `${m.nome} · ${site.titulo}`, descricao: m.subtitulo || site.descricao, corpo });
}

export function paginaInicial(site, materiais) {
  const itens = materiais
    .map((m) => `<li class="cartao"><a href="/${slug(m.palavra)}/"><span class="palavra">${esc(m.palavra)}</span>
<h3>${esc(m.nome)}</h3><p>${esc(m.subtitulo || '')}</p></a></li>`)
    .join('\n');
  const corpo = `<p class="topo">${esc(site.assinatura)}</p><h1>${esc(site.titulo)}</h1><p class="sub">${esc(site.descricao)}</p>
<ul class="lista">${itens || '<li class="cartao"><p>Os primeiros materiais chegam em breve.</p></li>'}</ul>`;
  return casca({ site, titulo: site.titulo, descricao: site.descricao, corpo });
}

/**
 * Lê conteudo/<site>/*.json (materiais aprovados) e escreve sites/<site>/.
 * Devolve a lista de arquivos gerados.
 */
export function gerarSites(raiz, sitesCfg) {
  const gerados = [];
  for (const site of sitesCfg.sites) {
    const dirConteudo = path.join(raiz, 'conteudo', site.id);
    const dirSite = path.join(raiz, 'sites', site.id);
    const materiais = fs.existsSync(dirConteudo)
      ? fs.readdirSync(dirConteudo).filter((a) => a.endsWith('.json'))
          .map((a) => JSON.parse(fs.readFileSync(path.join(dirConteudo, a), 'utf8')))
          .sort((a, b) => String(b.aprovadoEm).localeCompare(String(a.aprovadoEm)))
      : [];
    fs.rmSync(dirSite, { recursive: true, force: true });
    fs.mkdirSync(dirSite, { recursive: true });
    fs.writeFileSync(path.join(dirSite, 'index.html'), paginaInicial(site, materiais));
    gerados.push(path.join(dirSite, 'index.html'));
    for (const m of materiais) {
      const dir = path.join(dirSite, slug(m.palavra));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), paginaMaterial(site, m));
      gerados.push(path.join(dir, 'index.html'));
    }
  }
  return gerados;
}
