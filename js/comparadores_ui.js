// Interface dos comparadores: quadro por período, três pares de gráficos e as fontes. Sem innerHTML com dados.
import * as P from "./painel.js";
import * as X from "./comparadores.js";
import { fmtValor, nf, ND } from "./formatar.js";

const $ = (s, r = document) => r.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";

function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    n.append(f.nodeType ? f : document.createTextNode(String(f)));
  }
  return n;
}
function sv(tag, props = {}, ...filhos) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(props)) n.setAttribute(k, v);
  for (const f of filhos) n.append(f.nodeType ? f : document.createTextNode(String(f)));
  return n;
}
function limpar(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
  return n;
}
function externo(href, texto) {
  return el("a", { href, target: "_blank", rel: "noopener noreferrer" }, texto, el("span", { "aria-hidden": "true" }, " ↗"), el("span", { class: "so-leitor" }, " (abre em nova aba)"));
}

const pct = (v, c = 1) => (v === null ? ND : `${v >= 0 ? "+" : "-"}${nf(Math.abs(v), c)}%`);
const pp = (v) => (v === null ? ND : `${nf(v, 2)}%`);
const real = (aa, ipca) => (aa === null || ipca === null ? null : ((1 + aa / 100) / (1 + ipca / 100) - 1) * 100);

/** Gráfico de linha simples: um eixo, valores nulos viram quebra da linha (nunca zero). */
export function desenharLinha(alvo, serie, { descricao, largura, altura = 170, formatar, classe }) {
  const L = Math.max(240, Math.round(largura)), pad = { e: 44, d: 10, t: 14, b: 24 };
  const vals = serie.map((s) => s.valor).filter((v) => v !== null);
  const raiz = sv("svg", { viewBox: `0 0 ${L} ${altura}`, width: L, height: altura, role: "img", class: "linha-svg", "aria-label": descricao }, sv("title", {}, descricao));
  if (!vals.length) { alvo.replaceChildren(raiz); return; }
  let mn = Math.min(...vals, 0), mx = Math.max(...vals, 0);
  if (mx === mn) mx = mn + 1;
  const X_ = (i) => pad.e + ((L - pad.e - pad.d) * i) / Math.max(1, serie.length - 1);
  const Y_ = (v) => pad.t + ((mx - v) / (mx - mn)) * (altura - pad.t - pad.b);
  for (const v of [mn, 0, mx].filter((x, i, a) => a.indexOf(x) === i)) {
    raiz.append(sv("line", { x1: pad.e, x2: L - pad.d, y1: Y_(v).toFixed(1), y2: Y_(v).toFixed(1), class: v === 0 ? "linha-zero" : "linha-grade" }),
      sv("text", { x: pad.e - 6, y: (Y_(v) + 4).toFixed(1), class: "linha-eixo", "text-anchor": "end" }, formatar(v)));
  }
  let d = "", aberto = false;
  serie.forEach((s, i) => {
    if (s.valor === null) { aberto = false; return; }
    d += `${aberto ? "L" : "M"}${X_(i).toFixed(1)} ${Y_(s.valor).toFixed(1)} `;
    aberto = true;
  });
  raiz.append(sv("path", { d: d.trim(), class: `linha-traco ${classe}` }));
  serie.forEach((s, i) => {
    if (s.valor === null) return;
    const p = sv("circle", { cx: X_(i).toFixed(1), cy: Y_(s.valor).toFixed(1), r: 3, class: `linha-ponto ${classe}`, "data-periodo": s.periodo, "data-valor": String(Math.round(s.valor * 1e4) / 1e4) });
    p.append(sv("title", {}, `${s.periodo}: ${formatar(s.valor)}`));
    raiz.append(p);
  });
  serie.forEach((s, i) => {
    if ((i % 4 === 0 && i < serie.length - 3) || i === serie.length - 1) raiz.append(sv("text", { x: X_(i).toFixed(1), y: altura - 6, class: "linha-eixo", "text-anchor": i === serie.length - 1 ? "end" : "middle" }, s.periodo));
  });
  alvo.replaceChildren(raiz);
}

function textoCorrelacao(c) {
  return c.r === null ? "sem leitura (poucos pares)" : `r = ${nf(c.r, 2)} (n = ${c.n}): associação ${X.forcaCorrelacao(c.r)}`;
}

function quadro(ix, ext) {
  const janelas = P.janelas(ix, "ano").filter((j) => j.trimestres.length > 0).slice(-6);
  const dados = janelas.map((j) => X.quadroJanela(ix, ext, j));
  const cab = limpar($("#cmp-quadro thead"));
  cab.append(el("tr", {}, el("th", { scope: "col" }, "Variação contra o mesmo período do ano anterior"), ...dados.map((q) => el("th", { scope: "col", class: "num" }, q.rotulo))));
  const linhas = [
    ["Patrimar", null],
    ["Lançamentos (VGV)", (q) => pct(q.patrimar.lancamentos.aa)],
    ["Vendas líquidas (VGV)", (q) => pct(q.patrimar.vendas.aa)],
    ["Receita líquida", (q) => pct(q.patrimar.receita.aa)],
    ["Receita líquida acima ou abaixo do IPCA (real)", (q) => pct(real(q.patrimar.receita.aa, q.externos.ipca))],
    ["Receita líquida acima ou abaixo do INCC-M (real)", (q) => pct(real(q.patrimar.receita.aa, q.externos.incc))],
    ["Referências públicas", null],
    ["IPCA acumulado no período", (q) => pct(q.externos.ipca)],
    ["INCC-M acumulado no período (custo da obra)", (q) => pct(q.externos.incc)],
    ["Concessões de crédito imobiliário (R$)", (q) => pct(q.externos.concessoesAA)],
    ["PIB da construção, índice de volume", (q) => pct(q.externos.pibAA)],
    ["Selic meta no fim do período", (q) => (q.externos.selic.fim === null ? ND : `${nf(q.externos.selic.fim, 2)}%`)],
    ["Selic meta, média do período", (q) => (q.externos.selic.media === null ? ND : `${nf(q.externos.selic.media, 2)}%`)],
    ["Juros médios do financiamento imobiliário", (q) => (q.externos.juros === null ? ND : `${nf(q.externos.juros, 2)}%`)],
  ];
  const corpo = limpar($("#cmp-quadro tbody"));
  for (const [rot, f] of linhas) {
    if (!f) { corpo.append(el("tr", { class: "grupo" }, el("th", { scope: "row", colspan: String(dados.length + 1) }, rot))); continue; }
    corpo.append(el("tr", { "data-linha": rot }, el("th", { scope: "row" }, rot), ...dados.map((q) => el("td", { class: "num", "data-janela": q.chave }, f(q)))));
  }
}

const COR = { vendas: "s-1", lancamentos: "s-2", receita: "s-3", landbank: "s-4", incc: "s-5", ipca: "s-6", cdi: "s-7", credito: "s-8", pib: "s-9", selic: "s-10", juros: "s-11" };

/** Gráfico único: índices base 100 no eixo da esquerda e taxas (% ao ano) no eixo da direita, no mesmo tempo. */
export function desenharGraficoUnico(alvo, dados, ativas, sel, largura) {
  const L = Math.max(300, Math.round(largura)), H = 380, pad = { e: 52, d: 52, t: 16, b: 28 };
  const lista = dados.series.filter((s) => ativas.has(s.chave));
  const idx = lista.filter((s) => s.grupo === "indice"), tax = lista.filter((s) => s.grupo === "taxa");
  const raiz = sv("svg", { viewBox: `0 0 ${L} ${H}`, width: L, height: H, role: "img", class: "linha-svg", "aria-label": "Gráfico único: índices base 100 no eixo da esquerda e taxas de juros no eixo da direita, por trimestre, de 3T21 a 3T26. Os valores de cada trimestre estão na lista abaixo do gráfico." }, sv("title", {}, "Patrimar e referências públicas no mesmo gráfico"));
  const n = dados.periodos.length;
  const X_ = (i) => pad.e + ((L - pad.e - pad.d) * i) / Math.max(1, n - 1);
  const vI = idx.flatMap((s) => s.valores).filter((v) => v !== null);
  const iMin = Math.min(100, ...vI), iMax = Math.max(100, ...vI);
  const vT = tax.flatMap((s) => s.valores).filter((v) => v !== null);
  const tMax = Math.max(1, ...vT, 0);
  const YI = (v) => pad.t + ((iMax - v) / (iMax - iMin || 1)) * (H - pad.t - pad.b);
  const YT = (v) => pad.t + ((tMax - v) / tMax) * (H - pad.t - pad.b);
  if (idx.length) {
    for (const v of [iMin, 100, iMax].filter((x, i, a) => a.indexOf(x) === i)) {
      raiz.append(sv("line", { x1: pad.e, x2: L - pad.d, y1: YI(v).toFixed(1), y2: YI(v).toFixed(1), class: v === 100 ? "linha-zero" : "linha-grade" }),
        sv("text", { x: pad.e - 6, y: (YI(v) + 4).toFixed(1), class: "linha-eixo", "text-anchor": "end" }, nf(v, 0)));
    }
  }
  if (tax.length) {
    for (const v of [0, tMax]) raiz.append(sv("text", { x: L - pad.d + 6, y: (YT(v) + 4).toFixed(1), class: "linha-eixo", "text-anchor": "start" }, `${nf(v, 0)}%`));
  }
  for (const s of lista) {
    const Y_ = s.grupo === "indice" ? YI : YT;
    let d = "", aberto = false;
    s.valores.forEach((v, i) => {
      if (v === null) { aberto = false; return; }
      d += `${aberto ? "L" : "M"}${X_(i).toFixed(1)} ${Y_(v).toFixed(1)} `;
      aberto = true;
    });
    raiz.append(sv("path", { d: d.trim(), class: `linha-traco ${COR[s.chave]} ${s.dono === "Patrimar" ? "grossa" : "fina"} ${s.grupo === "taxa" ? "pontilhada" : ""}`, "data-serie": s.chave }));
  }
  const xs = X_(sel);
  raiz.append(sv("line", { x1: xs.toFixed(1), x2: xs.toFixed(1), y1: pad.t, y2: H - pad.b, class: "linha-guia" }));
  dados.periodos.forEach((q, i) => {
    if ((i % 4 === 0 && i < n - 3) || i === n - 1) raiz.append(sv("text", { x: X_(i).toFixed(1), y: H - 8, class: "linha-eixo", "text-anchor": i === n - 1 ? "end" : "middle" }, q));
  });
  alvo.replaceChildren(raiz);
}

function iniciarGrafico({ ix, ext }) {
  const dados = X.seriesDoGrafico(ix, ext);
  const ativas = new Set(dados.series.filter((s) => s.padrao).map((s) => s.chave));
  let sel = dados.periodos.length - 1;
  const chips = limpar($("#cmp-g-chips"));
  const alvo = $("#cmp-g");
  const faixa = $("#cmp-g-tri");
  faixa.min = "0"; faixa.max = String(dados.periodos.length - 1); faixa.value = String(sel);
  const fmt = (s, v) => (v === null ? ND : s.grupo === "taxa" ? `${nf(v, 2)}% ao ano` : nf(v, 1));
  const leitura = () => {
    const q = dados.periodos[sel];
    $("#cmp-g-trimestre").textContent = q;
    const ul = limpar($("#cmp-g-leitura"));
    for (const s of dados.series.filter((x) => ativas.has(x.chave))) {
      ul.append(el("li", { "data-serie": s.chave, "data-periodo": q }, el("span", { class: `chave ${COR[s.chave]}`, "aria-hidden": "true" }), el("span", { class: "leitura-rotulo" }, s.rotulo), el("strong", {}, fmt(s, s.valores[sel]))));
    }
  };
  const redesenhar = () => {
    desenharGraficoUnico(alvo, dados, ativas, sel, Math.floor(alvo.clientWidth || 800));
    leitura();
    for (const b of chips.children) b.setAttribute("aria-pressed", String(ativas.has(b.dataset.serie)));
  };
  for (const s of dados.series) {
    chips.append(el("button", { type: "button", class: "chip-botao chip-serie", "data-serie": s.chave, "aria-pressed": String(s.padrao), onclick: () => {
      if (ativas.has(s.chave)) { if (ativas.size > 1) ativas.delete(s.chave); } else ativas.add(s.chave);
      redesenhar();
    } }, el("span", { class: `chave ${COR[s.chave]}`, "aria-hidden": "true" }), s.rotulo));
  }
  faixa.addEventListener("input", () => { sel = Number(faixa.value); redesenhar(); });
  $("#cmp-g-base").textContent = `Índices em base 100 no ${X.BASE_INDICE}, o primeiro trimestre com 12 meses fechados de vendas e lançamentos. Linhas contínuas grossas são da Patrimar; as finas, referências públicas; as pontilhadas são taxas, lidas no eixo da direita.`;
  redesenhar();
  let t = null;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(redesenhar, 150); });
}

export function iniciarComparadores({ ix, ext }) {
  quadro(ix, ext);
  iniciarGrafico({ ix, ext });
  const serie = X.serieTrimestral(ix, ext);

  const lagsA = [0, 1, 2, 3, 4].map((a) => X.correlacaoComAtraso(serie, "selicFim", "vendasLtmAA", a));
  const corpo = limpar($("#cmp-lags tbody"));
  for (const c of lagsA) corpo.append(el("tr", { "data-atraso": String(c.atraso) }, el("th", { scope: "row" }, c.atraso === 0 ? "No mesmo trimestre" : `${c.atraso} trimestre${c.atraso > 1 ? "s" : ""} depois`), el("td", { class: "num" }, c.r === null ? ND : nf(c.r, 2)), el("td", { class: "num" }, String(c.n)), el("td", {}, c.r === null ? ND : X.forcaCorrelacao(c.r))));
  $("#cmp-a-texto").textContent = `Selic no fim do trimestre contra a variação anual das vendas de 12 meses, com a Selic vindo antes. ${lagsA.map((c) => `${c.atraso}T: ${c.r === null ? ND : nf(c.r, 2)}`).join("; ")}. Poucos trimestres, e as duas séries têm tendência própria: a associação não prova que os juros causaram a venda.`;
  const b = X.correlacaoComAtraso(serie, "incc12m", "margem", 0);
  $("#cmp-b-texto").textContent = `INCC-M de 12 meses contra a margem bruta do trimestre: ${textoCorrelacao(b)}. A margem contábil recebe efeitos de apropriação de receita, então a leitura é só de direção.`;
  const c3 = X.pearson(serie.map((s) => s.concessoesAA), serie.map((s) => s.vendasAA));
  $("#cmp-c-texto").textContent = `Concessões de crédito imobiliário contra as vendas da Patrimar, ambas em variação anual: ${textoCorrelacao(c3)}. Concessões são de todo o país e de todos os bancos; as vendas são só da Patrimar.`;

  const fontes = limpar($("#cmp-fontes"));
  for (const s of Object.values(ext.series)) {
    fontes.append(el("li", {}, el("strong", {}, s.nome), ` (${s.unidade}). ${s.fonte}, ${s.codigo}. `, externo(s.url, "Série consultada")));
  }
  $("#cmp-baixado").textContent = `Séries baixadas em ${ext.baixado_em.slice(8, 10)}/${ext.baixado_em.slice(5, 7)}/${ext.baixado_em.slice(0, 4)}.`;
}
