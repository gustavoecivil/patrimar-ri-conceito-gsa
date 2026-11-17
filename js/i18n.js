// Idioma: português (padrão) e inglês. A página é montada em português; no inglês, uma camada traduz o texto já montado.
// Os números e os períodos de cada texto são trocados por marcadores ({1}, {2}...), o texto sem números é procurado no dicionário
// (i18n/en.json) e os números voltam, já no formato inglês. Assim uma frase com mil números diferentes tem uma só tradução.
// Funções PURAS (abstrair, converterToken, traduzirTexto) são testadas em testes/i18n.test.mjs e usadas também pela colheita de textos.

const MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// período (1T26, 1S26, 9M26), endereço de célula (AI29), data (12/11/2026) e número (com sinal e porcentagem)
const PADRAO = /([1-4]T\d{2}|[12]S\d{2}|[69]M\d{2}|\b[A-Z]{1,2}\d{1,3}\b|\d{1,2}\/\d{1,2}\/\d{4}|(?:(?<![\w])[+\-−])?\d[\d.,]*\d%?|(?:(?<![\w])[+\-−])?\d%?)/g;

/**
 * Troca cada rótulo de indicador conhecido por {L1}, {L2}... e cada período, célula, data e número por {1}, {2}...
 * Devolve a chave (texto com marcadores), os trechos numéricos e os rótulos usados, em ordem.
 * Os rótulos vêm do dicionário (entrada "__rotulos__"): assim "Lucro líquido, último valor R$ 3 mi" e "Receita, último valor R$ 9 mi" têm um só modelo.
 */
export function abstrair(texto, rotulos = []) {
  const usados = [];
  let base = texto;
  const ordenados = [...rotulos].sort((a, b) => b.length - a.length);
  for (const r of ordenados) {
    if (!r || r.length < 10 || !base.includes(r)) continue;
    const marca = `${usados.length}`;
    if (base.split(r).length > 2) continue;           // rótulo repetido no mesmo texto: deixa para o dicionário
    usados.push(r);
    base = base.replace(r, marca);
  }
  const tokens = [];
  const chave = base
    .split(/(\d+)/)
    .map((parte) => (/^\d+$/.test(parte) ? `{L${Number(parte.slice(1, -1)) + 1}}` : parte.replace(PADRAO, (m) => { tokens.push(m); return `{${tokens.length}}`; })))
    .join("");
  return { chave, tokens, rotulos: usados };
}

function milhar(inteiro) {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Um trecho do português para o inglês: 3T26 vira 3Q26, 1S26 vira 1H26, 12/11/2026 vira Nov 12, 2026, 1.510,5 vira 1,510.5. */
export function converterToken(tok) {
  let m = /^([1-4])T(\d{2})$/.exec(tok);
  if (m) return `${m[1]}Q${m[2]}`;
  m = /^([12])S(\d{2})$/.exec(tok);
  if (m) return `${m[1]}H${m[2]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(tok);
  if (m) return `${MESES[Number(m[2]) - 1] ?? m[2]} ${Number(m[1])}, ${m[3]}`;
  m = /^([+\-−]?)(\d+(?:\.\d{3})*)(?:,(\d+))?(%?)$/.exec(tok);
  if (m) {
    const agrupado = m[2].includes(".");                     // o português só agrupa com ponto; anos e códigos (2025) ficam como estão
    const inteiro = m[2].replace(/\./g, "");
    return `${m[1] === "−" ? "-" : m[1]}${agrupado ? milhar(inteiro) : inteiro}${m[3] !== undefined ? `.${m[3]}` : ""}${m[4]}`;
  }
  return tok;
}

const SO_MARCADORES = /^[\sL{}\d%+\-−.,;:()/R$x×÷=<>|·•↗▲▼‹›*"'“”]*$/;

/**
 * Traduz uma chave (texto com marcadores). Procura no dicionário e, se não achar, tenta as famílias de rótulos que só mudam
 * por um prefixo ou sufixo ("A: Lançamentos", "Energia ({1})", "Alavancagem, {1}"), traduzindo o miolo.
 */
export function traduzirChave(chave, dic, fundo = 0) {
  const direto = dic[chave];
  if (direto !== undefined) return direto;
  if (SO_MARCADORES.test(chave.replace(/\{L?\d+\}/g, "0"))) return chave;   // só números, períodos e símbolos
  if (fundo > 2) return null;
  let m = /^([AB]): (.+)$/.exec(chave);
  if (m) { const r = traduzirChave(m[2], dic, fundo + 1); return r === null ? null : `${m[1]}: ${r}`; }
  m = /^(.+?) \((\{\d+\})\)$/.exec(chave);
  if (m) { const r = traduzirChave(m[1], dic, fundo + 1); return r === null ? null : `${r} (${m[2]})`; }
  m = /^(.+?), (\{\d+\})$/.exec(chave);
  if (m) { const r = traduzirChave(m[1], dic, fundo + 1); return r === null ? null : `${r}, ${m[2]}`; }
  return null;
}

/** Traduz um trecho de texto. Devolve null quando não há tradução e o texto tem palavras (para a auditoria acusar). */
export function traduzirTexto(texto, dicionario) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(texto);
  const [, ini, miolo, fim] = m;
  if (!miolo) return texto;
  const { chave, tokens, rotulos } = abstrair(miolo, dicionario.__rotulos__ ?? []);
  const en = traduzirChave(chave, dicionario);
  if (en === null) return null;
  let falhou = false;
  const saida = en.replace(/\{(L?)(\d+)\}/g, (_, l, i) => {
    if (l) {
      const t = traduzirTexto(rotulos[Number(i) - 1] ?? "", { ...dicionario, __rotulos__: [] });
      if (t === null) { falhou = true; return ""; }
      return t;
    }
    return converterToken(tokens[Number(i) - 1] ?? "");
  });
  return falhou ? null : ini + saida + fim;
}

// ------------------------------------------------------------------ navegador

const ATRIBUTOS = ["aria-label", "title", "placeholder", "alt"];
const IGNORAR = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
let dicionario = null;

export function idiomaAtual() {
  const url = new URLSearchParams(location.search).get("lang");
  if (url === "en" || url === "pt") return url;
  try {
    return localStorage.getItem("idioma") === "en" ? "en" : "pt";
  } catch (_) {
    return "pt";
  }
}

function ignorado(no) {
  for (let n = no.nodeType === 3 ? no.parentNode : no; n && n.nodeType === 1; n = n.parentNode) {
    if (IGNORAR.has(n.tagName) || n.hasAttribute?.("data-sem-traducao")) return true;
  }
  return false;
}

const feitos = new WeakMap();   // nó de texto -> último texto escrito pela tradução (evita traduzir de novo o que já está em inglês)

function traduzirNo(no) {
  if (ignorado(no)) return;
  if (no.nodeType === 3) {
    if (feitos.get(no) === no.data) return;
    const en = traduzirTexto(no.data, dicionario);
    if (en === null) {
      if (/[A-Za-zÀ-ú]/.test(no.data)) no.parentNode?.setAttribute("data-pendente-traducao", "1");
      return;
    }
    if (en !== no.data) no.data = en;
    feitos.set(no, no.data);
    return;
  }
  if (no.nodeType !== 1) return;
  for (const a of ATRIBUTOS) {
    if (no.hasAttribute(a) && !no.hasAttribute(`data-pt-${a}`)) {
      const orig = no.getAttribute(a);
      const en = traduzirTexto(orig, dicionario);
      if (en === null) { if (/[A-Za-zÀ-ú]/.test(orig)) no.setAttribute("data-pendente-traducao", "1"); continue; }
      no.setAttribute(`data-pt-${a}`, orig);
      no.setAttribute(a, en);
    }
  }
  for (const f of no.childNodes) traduzirNo(f);
}

export async function iniciarIdioma() {
  const lang = idiomaAtual();
  document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
  for (const b of document.querySelectorAll("[data-idioma]")) {
    b.setAttribute("aria-pressed", String(b.dataset.idioma === lang));
    b.addEventListener("click", () => {
      try { localStorage.setItem("idioma", b.dataset.idioma); } catch (_) { /* sem armazenamento */ }
      const q = new URLSearchParams(location.search);
      q.set("lang", b.dataset.idioma);
      location.search = q.toString();
    });
  }
  if (lang !== "en") return;
  const r = await fetch("i18n/en.json", { cache: "no-cache" });
  dicionario = await r.json();
  const raiz = document.documentElement;
  traduzirNo(raiz);
  document.title = traduzirTexto(document.title, dicionario) ?? document.title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", traduzirTexto(desc.getAttribute("content"), dicionario) ?? desc.getAttribute("content"));
  let pendente = new Set(), agendado = false;
  const processar = () => {
    agendado = false;
    const lista = [...pendente];
    pendente = new Set();
    for (const n of lista) if (n.isConnected) traduzirNo(n);
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") pendente.add(m.target);
      else for (const n of m.addedNodes) pendente.add(n);
    }
    if (!agendado) { agendado = true; requestAnimationFrame(processar); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  document.body.classList.add("idioma-en");
}
