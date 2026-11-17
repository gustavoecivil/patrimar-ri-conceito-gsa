// Interface: monta a página a partir dos dados. Nenhum número é escrito à mão: tudo vem de data_site.json
// pelas funções puras de calculos.js. Sem innerHTML com dados: só nós de texto.
import { carregar } from "./dados.js";
import * as C from "./calculos.js";
import { fmtValor, fmtPct, nf, ND, rotuloPeriodo, ROTULO_TIPO_INDICADOR, ROTULO_SECAO } from "./formatar.js";
import { desenharSkyline, desenharSparkline, desenharExplorador, desenharBarras } from "./graficos.js";
import * as P from "./painel.js";
import { criarAssistente, PERGUNTAS_SUGERIDAS } from "./assistente.js";

const $ = (s, r = document) => r.querySelector(s);

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

function externo(href, texto, cls) {
  return el("a", { href, target: "_blank", rel: "noopener noreferrer", class: cls }, texto, el("span", { "aria-hidden": "true" }, " ↗"), el("span", { class: "so-leitor" }, " (abre em nova aba)"));
}

function limpar(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
  return n;
}

// ------------------------------------------------------------------ tema

function iniciarTema() {
  const raiz = document.documentElement;
  const botao = $("#tema");
  let salvo = null;
  try { salvo = localStorage.getItem("tema"); } catch (_) { /* navegação privada: segue o sistema */ }
  if (salvo === "claro" || salvo === "escuro") raiz.dataset.tema = salvo;
  const forcado = new URLSearchParams(location.search).get("tema"); // ?tema=escuro vale só para esta visita
  if (forcado === "claro" || forcado === "escuro") raiz.dataset.tema = forcado;
  const escuroAgora = () => raiz.dataset.tema ? raiz.dataset.tema === "escuro" : matchMedia("(prefers-color-scheme: dark)").matches;
  const atualizar = () => {
    const escuro = escuroAgora();
    botao.setAttribute("aria-pressed", String(escuro));
    botao.querySelector(".tema-rotulo").textContent = escuro ? "Tema claro" : "Tema escuro";
  };
  botao.addEventListener("click", () => {
    raiz.dataset.tema = escuroAgora() ? "claro" : "escuro";
    try { localStorage.setItem("tema", raiz.dataset.tema); } catch (_) { /* sem armazenamento */ }
    atualizar();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", atualizar);
  atualizar();
}

// ------------------------------------------------------------------ abertura

function textoAbertura({ ix, ds }) {
  const lb = C.serieTri(ix, 21);
  const ult = C.ultimoComDado(lb);
  const un = C.serieTri(ix, 13);
  const ultUn = C.ultimoComDado(un);
  const frases = [];
  if (ult) {
    const rec = C.confirmaRecorde(lb, ult.periodo) ? `, o maior da série trimestral desde ${C.recorde(lb).de}` : "";
    frases.push(`Landbank de ${fmtValor(ult.valor, "BRL_MILHOES", { bi: 1 })} no ${ult.periodo}${rec}.`);
  }
  if (ultUn) {
    const rec = C.confirmaRecorde(un, ultUn.periodo) ? ", máximo da série" : "";
    const aa = C.variacaoAA(ix, 13, ultUn.periodo);
    frases.push(`${fmtValor(ultUn.valor, "UNIDADES")} vendidas no ${ultUn.periodo}${rec}${aa === null ? "" : `, ${fmtPct(aa, 0)} sobre o ${C.mesmoTrimestreAnoAnterior(ultUn.periodo)}`}.`);
  }
  frases.push("Os trimestres mais fracos aparecem na mesma página, cada um com contexto e fonte.");
  return frases.join(" ");
}

function iniciarAbertura(ctx) {
  $("#abertura-texto").textContent = textoAbertura(ctx);
  const c = ctx.ds.meta.cobertura;
  $("#abertura-cobertura").textContent = `Dados públicos até o ${c.operacional} (operacional) e o ${c.financeiro} (financeiro).`;
}

// ------------------------------------------------------------------ panorama

function chipVariacao(k) {
  if (k.variacaoPct !== null) {
    const sobe = k.variacaoPct >= 0;
    return el("span", { class: `chip ${sobe ? "chip-bom" : "chip-atencao"}` }, el("span", { "aria-hidden": "true" }, sobe ? "▲ " : "▼ "), `${fmtPct(k.variacaoPct, 1)} contra ${k.comparacao.periodo}`);
  }
  if (k.comparacao.periodo && k.comparacao.valor !== null) {
    return el("span", { class: "chip chip-neutro" }, `${k.comparacao.periodo}: ${fmtValor(k.comparacao.valor, k.unidade, { bi: 1 })}`);
  }
  return el("span", { class: "chip chip-neutro" }, `Sem base de ${C.mesmoTrimestreAnoAnterior(k.periodo) ?? "comparação"}: ${ND}`);
}

function cartaoKpi(k, { ds, an }) {
  const nota = an.pontos_de_atencao[String(k.id)]?.find((a) => a.periodo === k.periodo);
  const f = nota ? an.fontes[nota.fonte] : null;
  return el("article", { class: `kpi${k.valor < 0 ? " kpi-negativo" : ""}` },
    el("h3", { class: "kpi-rotulo" }, k.rotulo),
    el("p", { class: "kpi-valor" }, fmtValor(k.valor, k.unidade, { bi: 1 })),
    el("p", { class: "kpi-meta" }, el("span", { class: "periodo" }, k.periodo), chipVariacao(k),
      k.recorde ? el("span", { class: "chip chip-recorde" }, `Recorde da série (desde ${k.recordeDesde})`) : null),
    nota ? el("p", { class: "kpi-nota" }, el("strong", {}, "Contexto: "), nota.contexto, " ",
      f ? externo(f.url, `${f.documento}${nota.pagina ? `, p. ${[].concat(nota.pagina).join(" e ")}` : ""}`) : null) : null,
    el("p", { class: "kpi-fonte" }, "Fonte: ", fonteLink(ds, "planilha oficial", k.origem)));
}

function iniciarPanorama(ctx) {
  const alvo = limpar($("#panorama-cartoes"));
  const kpis = C.kpisPanorama(ctx.ix);
  const grupos = [["Operacional", kpis.filter((k) => [1, 9, 21].includes(k.id))], ["Financeiro", kpis.filter((k) => [25, 40, 93].includes(k.id))]];
  for (const [nome, lista] of grupos) {
    const per = [...new Set(lista.map((k) => k.periodo))].join(" e ");
    alvo.append(el("h3", { class: "grupo-titulo" }, `${nome}, ${per}`));
    alvo.append(el("div", { class: "grade-kpi" }, lista.map((k) => cartaoKpi(k, ctx))));
  }
  const c = ctx.ds.meta.cobertura;
  $("#panorama-aviso").textContent = `Os dados financeiros terminam no ${c.financeiro} e os operacionais no ${c.operacional}. Ausência de dado aparece como ${ND}, nunca como zero.`;
}

// ------------------------------------------------------------------ indicadores

const PRINCIPAIS = [1, 5, 9, 13, 17, 21, 22, 25, 27, 28, 40, 41, 73, 93, 95, 102, 114, 115, 128, 146];
const estadoInd = { ordem: "indicador", dir: 1, secao: "principais", busca: "" };

function linhasIndicadores({ ix, ds }) {
  return ds.indicadores
    .filter((i) => (estadoInd.secao === "principais" ? PRINCIPAIS.includes(i.id) : estadoInd.secao === "todos" || i.secao === estadoInd.secao))
    .filter((i) => !estadoInd.busca || `${i.rotulo} ${i.nome}`.toLowerCase().includes(estadoInd.busca))
    .map((i) => {
      const ultimo = C.ultimoComDado(C.serieTri(ix, i.id));
      const pp = i.unidade === "PERCENTUAL";
      const aa = ultimo ? (pp ? C.variacaoPP(ix, i.id, ultimo.periodo) : C.variacaoAA(ix, i.id, ultimo.periodo)) : null;
      const base = ultimo ? C.valor(ix, i.id, C.mesmoTrimestreAnoAnterior(ultimo.periodo)) : null;
      // Razões em %: diferença em p.p. Demais: percentual, só com valor e base positivos.
      return { i, ultimo, pp, aa: pp ? aa : ultimo && ultimo.valor > 0 && base > 0 ? aa : null };
    });
}

function ordenar(linhas) {
  const { ordem, dir } = estadoInd;
  const chave = {
    indicador: (l) => l.i.rotulo,
    periodo: (l) => (l.ultimo ? C.ordemPeriodo(l.ultimo.periodo) : -1),
    valor: (l) => (l.ultimo ? l.ultimo.valor : -Infinity),
    variacao: (l) => (l.aa === null ? -Infinity : l.aa),
  }[ordem];
  return [...linhas].sort((a, b) => {
    const x = chave(a), y = chave(b);
    return (typeof x === "string" ? x.localeCompare(y, "pt-BR") : x - y) * dir;
  });
}

function desenharIndicadores(ctx) {
  const linhas = ordenar(linhasIndicadores(ctx));
  const corpo = limpar($("#tabela-indicadores tbody"));
  for (const { i, ultimo, aa, pp } of linhas) {
    corpo.append(el("tr", {},
      el("th", { scope: "row" }, i.rotulo, el("span", { class: "sub" }, `${ROTULO_SECAO[i.secao]}${i.subgrupo && i.secao !== "OPERACIONAL" ? `, ${i.subgrupo}` : ""}`)),
      el("td", {}, ultimo ? ultimo.periodo : ND),
      el("td", { class: "num" }, ultimo ? fmtValor(ultimo.valor, i.unidade) : ND),
      el("td", { class: "num" }, aa === null ? ND : pp ? `${aa >= 0 ? "+" : "-"}${nf(Math.abs(aa), 1)} p.p.` : fmtPct(aa, 1)),
      el("td", {}, el("span", { class: `pilula pilula-${i.tipo}` }, ROTULO_TIPO_INDICADOR[i.tipo])),
      el("td", {}, ultimo ? fonteLink(ctx.ds, "", C.origemValor(ctx.ix, i.id, ultimo.periodo)) : ND)));
  }
  $("#indicadores-contagem").textContent = `${linhas.length} indicador(es)`;
  document.querySelectorAll("#tabela-indicadores thead th[data-ordem]").forEach((th) => {
    th.setAttribute("aria-sort", th.dataset.ordem === estadoInd.ordem ? (estadoInd.dir === 1 ? "ascending" : "descending") : "none");
  });
}

function iniciarIndicadores(ctx) {
  const sel = $("#ind-secao");
  for (const [v, t] of [["principais", "Principais"], ["OPERACIONAL", "Operacional"], ["DRE", "Resultado (DRE)"], ["FLUXO_CAIXA", "Fluxo de caixa"], ["BALANCO", "Balanço"], ["todos", "Todos os 147"]]) sel.append(el("option", { value: v }, t));
  sel.addEventListener("change", () => { estadoInd.secao = sel.value; desenharIndicadores(ctx); });
  $("#ind-busca").addEventListener("input", (e) => { estadoInd.busca = e.target.value.trim().toLowerCase(); desenharIndicadores(ctx); });
  document.querySelectorAll("#tabela-indicadores thead button[data-ordem]").forEach((b) => b.addEventListener("click", () => {
    const o = b.closest("th").dataset.ordem;
    estadoInd.dir = estadoInd.ordem === o ? -estadoInd.dir : 1;
    estadoInd.ordem = o;
    desenharIndicadores(ctx);
  }));
  desenharIndicadores(ctx);
}

// ------------------------------------------------------------------ documentos

const estadoDoc = { tipo: "", ano: "", busca: "" };

function desenharDocumentos({ ds }) {
  const lista = ds.documentos.filter((d) =>
    (!estadoDoc.tipo || d.tipo === estadoDoc.tipo) && (!estadoDoc.ano || String(d.ano) === estadoDoc.ano) &&
    (!estadoDoc.busca || d.titulo.toLowerCase().includes(estadoDoc.busca) || `${d.tri ?? ""}t${String(d.ano).slice(-2)}`.includes(estadoDoc.busca)));
  const alvo = limpar($("#lista-documentos"));
  if (!lista.length) alvo.append(el("li", { class: "vazio" }, "Nenhum documento com esses filtros."));
  for (const d of lista) {
    alvo.append(el("li", { class: "doc" },
      el("span", { class: "doc-periodo" }, d.tri ? `${d.tri}T${String(d.ano).slice(-2)}` : String(d.ano)),
      el("span", { class: "doc-corpo" }, el("span", { class: "doc-titulo" }, d.titulo), el("span", { class: "sub" }, ds.tipos_documento[d.tipo])),
      externo(d.url, "Abrir original", "doc-abrir")));
  }
  $("#documentos-contagem").textContent = `${lista.length} documento(s), do mais recente ao mais antigo`;
}

function iniciarDocumentos(ctx) {
  const { ds } = ctx;
  const tipo = $("#doc-tipo"), ano = $("#doc-ano");
  tipo.append(el("option", { value: "" }, "Todos os tipos"));
  for (const [v, t] of Object.entries(ds.tipos_documento)) if (ds.documentos.some((d) => d.tipo === v)) tipo.append(el("option", { value: v }, t));
  ano.append(el("option", { value: "" }, "Todos os anos"));
  for (const a of [...new Set(ds.documentos.map((d) => d.ano))].sort((x, y) => y - x)) ano.append(el("option", { value: String(a) }, String(a)));
  tipo.addEventListener("change", () => { estadoDoc.tipo = tipo.value; desenharDocumentos(ctx); });
  ano.addEventListener("change", () => { estadoDoc.ano = ano.value; desenharDocumentos(ctx); });
  $("#doc-busca").addEventListener("input", (e) => { estadoDoc.busca = e.target.value.trim().toLowerCase(); desenharDocumentos(ctx); });
  desenharDocumentos(ctx);
}

// ------------------------------------------------------------------ painel da Central de Resultados

const estadoPainel = { visao: "tri", chave: null, indicador: 25 };
const ROTULO_VISAO_PAINEL = { tri: "Trimestre", sem: "Semestre", ano: "Ano", todos: "Todos os períodos" };
const AVISO_VISAO = {
  tri: "Valores publicados de cada trimestre. No financeiro do 3T26, a fonte é o ITR 3T26, com a página.",
  sem: "Semestre: fluxos (receita, lucro, lançamentos) somam os dois trimestres; saldos (caixa, landbank) são os do fim do semestre. Cálculo GSA.",
  ano: "Ano: valores anuais publicados na planilha oficial. O ano corrente aparece como acumulado até o último trimestre divulgado (soma dos trimestres, cálculo GSA).",
  todos: "Série completa, de 1T20 ao último trimestre. Para os cartões e a conta de um período, escolha trimestre, semestre ou ano.",
};

function lerEstadoPainel(ix) {
  const q = new URLSearchParams(location.search);
  const v = q.get("cv");
  if (v && P.VISOES[v]) estadoPainel.visao = v;
  const lista = P.janelas(ix, estadoPainel.visao);
  estadoPainel.chave = (lista.find((j) => j.chave === q.get("c")) ?? lista[lista.length - 1]).chave;
  const i = Number(q.get("ci"));
  if (P.KPIS_PAINEL.includes(i)) estadoPainel.indicador = i;
}

function gravarEstadoPainel() {
  const q = new URLSearchParams(location.search);
  q.set("cv", estadoPainel.visao);
  q.set("c", estadoPainel.chave);
  q.set("ci", String(estadoPainel.indicador));
  try { history.replaceState(null, "", `${location.pathname}?${q.toString()}${location.hash}`); } catch (e) { /* sem histórico: segue sem salvar o estado */ }
}

function fmtComp(comp, unidade) {
  if (!comp) return ND;
  if (comp.tipo === "pct") return fmtPct(comp.valor, 1);
  if (comp.tipo === "pp") return `${comp.valor >= 0 ? "+" : "-"}${nf(Math.abs(comp.valor), 1)} p.p.`;
  return `diferença de ${fmtValor(comp.valor, unidade)}`;
}

function chipPainel(k) {
  if (!k.comp) return el("span", { class: "chip chip-neutro" }, k.periodoBase ? `Sem base em ${k.periodoBase}: ${ND}` : "Sem período de comparação");
  if (k.comp.tipo === "abs") return el("span", { class: "chip chip-neutro" }, `${k.periodoBase}: ${fmtValor(k.base, k.unidade, { bi: 1 })}`);
  const sobe = k.comp.valor >= 0;
  return el("span", { class: `chip ${sobe ? "chip-bom" : "chip-atencao"}` }, el("span", { "aria-hidden": "true" }, sobe ? "▲ " : "▼ "), `${fmtComp(k.comp, k.unidade)} contra ${k.periodoBase}`);
}

function cartaoPainel(k, j, { ds, ix }) {
  const fonte = k.valor === null ? `Sem dado neste período (${ND})` : k.origem ? fonteLink(ds, "planilha oficial", k.origem) : P.fonteJanela(ix, k.id, j);
  return el("article", { class: `kpi kpi-painel${k.valor !== null && k.valor < 0 ? " kpi-negativo" : ""}`, "data-id": String(k.id) },
    el("h4", { class: "kpi-rotulo" }, k.rotulo),
    el("p", { class: "kpi-valor" }, fmtValor(k.valor, k.unidade, { bi: 1 })),
    el("p", { class: "kpi-meta" }, el("span", { class: "periodo" }, j.rotulo), chipPainel(k)),
    el("p", { class: "kpi-fonte" }, el("span", {}, "Fonte: "), fonte));
}

function pilhaRecorte(rotulo, itens) {
  const total = itens.reduce((a, x) => a + x.valor, 0);
  return el("div", { class: "pilha-bloco" },
    el("p", { class: "pilha-rotulo" }, rotulo),
    el("div", { class: "pilha", role: "img", "aria-label": `${rotulo}: ${itens.map((x) => `${x.recorte} ${fmtValor(x.valor, "BRL_MILHOES")}`).join(", ")}` },
      itens.map((x, i) => el("span", { class: `seg seg-${i}`, style: `width:${((x.valor / total) * 100).toFixed(2)}%`, title: `${x.recorte}: ${fmtValor(x.valor, "BRL_MILHOES")}` }))),
    el("ul", { class: "pilha-legenda" }, itens.map((x, i) => el("li", { "data-recorte": x.recorte, "data-valor": String(x.valor), "data-status": x.status },
      el("span", { class: `chave seg-${i}`, "aria-hidden": "true" }), `${x.recorte}: ${fmtValor(x.valor, "BRL_MILHOES")} (${nf((x.valor / total) * 100, 0)}%)`,
      x.status === "PENDENTE_REVISAO" ? el("span", { class: "chip chip-atencao" }, "pendente de revisão") : x.status === "VALIDADO_COM_RESSALVA" ? el("span", { class: "chip chip-neutro" }, "com ressalva") : null))));
}

function desenharRecortesPainel({ dp, ix }, j) {
  const alvo = limpar($("#painel-recortes-corpo"));
  const r = P.recortesJanela(dp, j);
  if (!r) {
    alvo.append(el("p", { class: "nota" }, "Os dados por região e por marca são lidos dos gráficos das prévias operacionais e existem para os trimestres de 2023 em diante, para o primeiro semestre, os nove meses e o ano. Para este período não há leitura."));
    return;
  }
  const ant = P.janelaAnterior(ix, j);
  const ra = ant ? P.recortesJanela(dp, ant) : null;
  for (const [m, nome] of [["lancamentos", "Lançamentos (VGV 100%)"], ["vendas", "Vendas líquidas (VGV 100%)"]]) {
    for (const [t, tn] of [["REGIAO", "por região"], ["MARCA", "por marca"]]) {
      if (!r[m][t].length) continue;
      const fonte = r[m][t][0];
      alvo.append(el("figure", { class: "recorte", "data-metrica": m, "data-tipo": t },
        el("figcaption", {}, `${nome}, ${tn}`),
        pilhaRecorte(j.rotulo, r[m][t]),
        ra && ra[m][t].length ? pilhaRecorte(ant.rotulo, ra[m][t]) : null,
        el("p", { class: "nota" }, `Fonte: ${fonte.documento}, p. ${fonte.pagina}${ra && ra[m][t].length ? `; comparação: ${ra[m][t][0].documento}, p. ${ra[m][t][0].pagina}` : ""}.`)));
    }
  }
  alvo.append(el("p", { class: "nota" }, "Região ou marca sem barra não teve lançamento ou venda no período (as demais somam o total). Cada valor foi conferido: os pedaços somam o total do gráfico e o total bate com a planilha oficial."));
}

function desenharGraficoPainel({ ix }, j) {
  const id = estadoPainel.indicador;
  const i = ix.ind.get(id);
  const todos = estadoPainel.visao === "todos";
  const serie = todos ? P.serieJanelas(ix, id, "tri", null, 27) : P.serieJanelas(ix, id, estadoPainel.visao, j.chave, 12);
  const alvo = $("#painel-grafico");
  const descricao = `${i.rotulo}: ${serie.length} períodos, de ${serie[0].rotulo} a ${serie[serie.length - 1].rotulo}`;
  desenharBarras(alvo, serie, { descricao, largura: alvo.clientWidth || 560, formatar: (v) => fmtValor(v, i.unidade, { bi: 1 }) });
  $("#painel-grafico-nota").textContent = `${i.rotulo}, ${todos ? "todos os trimestres" : `últimos ${serie.length} períodos até ${j.rotulo}`}. Barras a partir do zero; n/d é falta de dado, nunca zero.`;
}

function desenharPainel(ctx) {
  const { ix, ds } = ctx;
  const lista = P.janelas(ix, estadoPainel.visao);
  const k = lista.findIndex((x) => x.chave === estadoPainel.chave);
  const j = lista[k];
  const ant = P.janelaAnterior(ix, j);
  const todos = estadoPainel.visao === "todos";
  $("#painel-visao-rotulo").textContent = ROTULO_VISAO_PAINEL[estadoPainel.visao];
  $("#painel-periodo").textContent = j.rotulo;
  $("#painel-aviso").textContent = AVISO_VISAO[estadoPainel.visao];
  const ant_ = $("#painel-ant"), prox = $("#painel-prox");
  ant_.disabled = todos || k <= 0;
  prox.disabled = todos || k >= lista.length - 1;
  for (const b of document.querySelectorAll("#painel-visoes button")) b.setAttribute("aria-pressed", String(b.dataset.visao === estadoPainel.visao));

  const kpis = limpar($("#painel-kpis"));
  const tabela = $("#painel-tabela tbody");
  limpar(tabela);
  for (const sel of ["#painel-kpis", ".painel-duas .painel-bloco:nth-child(2)"]) $(sel).hidden = todos;
  $("#painel-tabela").closest(".tabela-rolagem").hidden = todos;
  const subs = [...document.querySelectorAll("#painel > h3.subtitulo")];
  for (const h of subs) if (["Os números do período", "A conta do período"].includes(h.textContent)) h.hidden = todos;
  if (!todos) {
    for (const x of P.kpisJanela(ix, j)) kpis.append(cartaoPainel(x, j, ctx));
    $("#painel-col-base").textContent = ant ? ant.rotulo : "Comparação";
    for (const l of P.linhasTabela(ix, j)) {
      tabela.append(el("tr", { "data-id": String(l.id) },
        el("th", { scope: "row" }, l.rotulo, el("span", { class: "sub" }, ROTULO_SECAO[l.secao])),
        el("td", { class: "num" }, fmtValor(l.valor, l.unidade)),
        el("td", { class: "num" }, l.base === null ? ND : fmtValor(l.base, l.unidade)),
        el("td", { class: "num" }, l.valor === null || l.base === null ? ND : fmtComp(l.comp, l.unidade))));
    }
    desenharRecortesPainel(ctx, j);
  }
  desenharGraficoPainel(ctx, j);

  const botoes = limpar($("#painel-botoes"));
  if (!todos) {
    botoes.append(el("button", { type: "button", class: "botao botao-primario", id: "painel-csv", onclick: () => baixarCsvPainel(ctx, j) }, `Baixar os dados de ${j.rotulo} (CSV)`));
  }
  botoes.append(el("a", { class: "botao", href: "dados/patrimar_dados_ri.xlsx", download: "patrimar_dados_ri.xlsx" }, "Baixar a planilha completa (Excel)"),
    el("a", { class: "botao", href: "dados/dados_longos.csv", download: "patrimar_dados_longos.csv" }, "Baixar a série completa (CSV)"));

  const docs = limpar($("#painel-docs"));
  const lst = todos ? [] : P.documentosJanela(ds, j);
  if (!lst.length) docs.append(el("li", { class: "nota" }, todos ? "Escolha um período para ver os documentos originais dele." : "Nenhum documento deste período na Central de Resultados."));
  for (const d of lst) {
    docs.append(el("li", { "data-tipo": d.tipo },
      el("span", { class: "pilula pilula-fluxo" }, ds.tipos_documento[d.tipo] ?? d.tipo), el("span", { class: "doc-titulo" }, d.titulo),
      externo(d.url, d.complemento ? "Abrir na Central de Resultados" : "Abrir original", "doc-abrir")));
  }
  gravarEstadoPainel();
}

function baixarCsvPainel({ ix }, j) {
  const blob = new Blob([P.csvJanela(ix, j)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `patrimar_${j.chave}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function iniciarPainel(ctx) {
  const { ix } = ctx;
  lerEstadoPainel(ix);
  const caixa = $("#painel-visoes");
  for (const [v, nome] of Object.entries(P.VISOES)) {
    caixa.append(el("button", { type: "button", "data-visao": v, "aria-pressed": "false", onclick: () => {
      const atual = P.janelas(ix, estadoPainel.visao).find((x) => x.chave === estadoPainel.chave);
      const ultimo = atual.trimestres[atual.trimestres.length - 1];
      const novas = P.janelas(ix, v);
      estadoPainel.visao = v;
      estadoPainel.chave = (novas.find((x) => x.trimestres.includes(ultimo)) ?? novas[novas.length - 1]).chave;
      desenharPainel(ctx);
    } }, nome));
  }
  const sel = $("#painel-indicador");
  for (const id of P.KPIS_PAINEL) sel.append(el("option", { value: String(id) }, ix.ind.get(id).rotulo));
  sel.value = String(estadoPainel.indicador);
  sel.addEventListener("change", () => { estadoPainel.indicador = Number(sel.value); desenharPainel(ctx); });
  const mover = (d) => {
    const lista = P.janelas(ix, estadoPainel.visao);
    const k = lista.findIndex((x) => x.chave === estadoPainel.chave) + d;
    if (k >= 0 && k < lista.length) { estadoPainel.chave = lista[k].chave; desenharPainel(ctx); }
  };
  $("#painel-ant").addEventListener("click", () => mover(-1));
  $("#painel-prox").addEventListener("click", () => mover(1));
  let espera = null;
  window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => desenharGraficoPainel(ctx, P.janelas(ix, estadoPainel.visao).find((x) => x.chave === estadoPainel.chave)), 150); });
  desenharPainel(ctx);
}

// ------------------------------------------------------------------ metodologia

function iniciarMetodologia({ ds }) {
  const c = ds.meta.contagens;
  $("#met-contagens").textContent = `${nf(c.indicadores, 0)} indicadores, ${nf(c.observacoes_com_valor, 0)} observações com valor, ${c.tracos_na_fonte} células com traço na fonte (tratadas como ${ND}), ${c.documentos} documentos de resultados.${c.valores_do_itr ? ` Além disso, ${nf(c.valores_do_itr, 0)} valores financeiros do 3T26 vêm do ITR 3T26, com página citada, porque a planilha ainda não os trazia.` : ""}`;
  const fonte = ds.meta.fonte_planilha;
  const alvoFonte = limpar($("#met-fonte"));
  alvoFonte.append(externo(fonte.url, fonte.nome), el("span", { class: "sub" }, `SHA-256 do arquivo: ${fonte.sha256}`));

  const tbc = limpar($("#tabela-conciliacao tbody"));
  for (const x of ds.conciliacao) {
    tbc.append(el("tr", {},
      el("th", { scope: "row" }, x.periodo), el("td", { class: "num" }, nf(x.release, 1)), el("td", { class: "num" }, nf(x.planilha, 3)),
      el("td", { class: "num" }, `${x.diferenca >= 0 ? "+" : "-"}${nf(Math.abs(x.diferenca), 3)}`),
      el("td", {}, x.status === "CONCILIADO_ARREDONDAMENTO" ? "Dentro do arredondamento" : x.status)));
  }

  const tbm = limpar($("#tabela-margem tbody"));
  const ordem = ["1T24", "2024", "1T25", "6M25", "3T25", "9M25", "4T25", "2025", "1T26", "2T26", "6M26"];
  for (const m of [...ds.margem_ajustada].sort((a, b) => ordem.indexOf(a.periodo) - ordem.indexOf(b.periodo))) {
    tbm.append(el("tr", {},
      el("th", { scope: "row" }, m.periodo), el("td", { class: "num" }, `${nf(m.pct, 1)}%`), el("td", {}, m.descricao),
      el("td", {}, externo(m.url, `${m.documento}, p. ${m.pagina}`))));
  }
}

// ------------------------------------------------------------------ skyline

function iniciarSkyline({ ix, ds }) {
  const serie = C.serieTri(ix, 21).filter((x) => x.valor !== null);
  const ult = serie[serie.length - 1];
  const recorde = C.confirmaRecorde(serie, ult.periodo);
  const rotuloValor = (v) => fmtValor(v, "BRL_MILHOES", { bi: 1 });
  const descricao = `Landbank em VGV por trimestre, de ${serie[0].periodo} (${rotuloValor(serie[0].valor)}) a ${ult.periodo} (${rotuloValor(ult.valor)}${recorde ? ", o maior da série" : ""}). Cada prédio é um trimestre e a altura é proporcional ao valor, a partir de zero.`;
  const alvo = $("#skyline");
  let animar = true;
  let larguraAtual = 0;
  const desenhar = () => {
    const L = Math.round(alvo.clientWidth);
    if (!L || Math.abs(L - larguraAtual) < 4) return;
    larguraAtual = L;
    desenharSkyline(alvo, serie, { rotuloValor, descricao, selo: recorde ? "Recorde da série" : null, animar, largura: L });
    animar = false;
  };
  desenhar();
  if ("ResizeObserver" in window) new ResizeObserver(() => desenhar()).observe(alvo);
  const legenda = limpar($("#skyline-legenda"));
  legenda.append(`Landbank em VGV, no fim de cada trimestre, de ${serie[0].periodo} a ${ult.periodo}. Altura proporcional ao valor, a partir de zero. Fonte: `,
    externo(ds.meta.fonte_planilha.url, `planilha oficial, linha ${ix.ind.get(21).linha}`), ".");
}

// ------------------------------------------------------------------ três provas

function chipRecorde(d) {
  return d.recorde ? el("span", { class: "chip chip-recorde" }, `Recorde da série (desde ${d.recordeDesde})`) : null;
}
function chipAA(d) {
  return d.variacaoPct === null ? null : el("span", { class: `chip ${d.variacaoPct >= 0 ? "chip-bom" : "chip-atencao"}` }, el("span", { "aria-hidden": "true" }, d.variacaoPct >= 0 ? "▲ " : "▼ "), `${fmtPct(d.variacaoPct, 1)} contra ${d.comparacao.periodo}`);
}
/** Link da fonte de um valor: célula da planilha oficial ou, no 3T26 do ITR, documento e página (o.tipo). */
function urlCentral(ds) {
  return ds.navegacao.find((n) => n.titulo === "Central de Resultados")?.url ?? "https://ri.patrimar.com.br/";
}
function fonteLink(ds, texto, o) {
  if (o.tipo === "documento") {
    const t = texto.replace(/(^|, )planilha oficial$/, "");
    return externo(urlCentral(ds), t ? `${t}, ${o.texto}` : o.texto);
  }
  return externo(ds.meta.fonte_planilha.url, texto ? `${texto}, célula ${o.celula}` : `célula ${o.celula}`);
}
function celulaLink(ds, texto, celula) {
  return externo(ds.meta.fonte_planilha.url, `${texto}, célula ${celula}`);
}

function provaTerreno(p, { ds, ix }) {
  const t = p.terreno, l = t.landbank;
  return el("article", { class: "prova", "aria-labelledby": "prova-terreno" },
    el("h3", { class: "prova-tema", id: "prova-terreno" }, "Terreno"),
    el("p", { class: "prova-numero" }, fmtValor(l.valor, "BRL_MILHOES", { bi: 1 })),
    el("p", { class: "prova-rotulo" }, `Landbank em VGV, ${l.periodo}`),
    el("p", { class: "prova-meta" }, chipRecorde(l), chipAA(l)),
    el("p", { class: "prova-leitura" }, `No ritmo dos últimos 12 meses (${fmtValor(t.lancamentos12m, "BRL_MILHOES", { bi: 2 })} lançados, de ${t.janela.de} a ${t.janela.ate}), o landbank cobre `,
      el("strong", {}, `${fmtValor(t.cobertura, "anos")} de lançamentos`), ". ", el("a", { href: "#cobertura" }, "Mover o ritmo no simulador")),
    el("p", { class: "prova-conta" }, "Cálculo GSA: landbank ÷ lançamentos dos últimos 12 meses. VGV potencial não é receita contratada."),
    el("p", { class: "prova-fonte" }, "Fonte: ", fonteLink(ds, "landbank, planilha oficial", l.origem), `; lançamentos na linha ${ix.ind.get(1).linha}.`));
}

function provaVenda(p, { ds, an }) {
  const v = p.venda, u = v.unidades, g = v.vgv;
  const vgvTexto = g.recorde
    ? `Em VGV, ${fmtValor(g.valor, "BRL_MILHOES")} (${fmtPct(g.variacaoPct, 1)} contra ${g.comparacao.periodo}), também o maior da série.`
    : `Em VGV, ${fmtValor(g.valor, "BRL_MILHOES")} (${fmtPct(g.variacaoPct, 1)} contra ${g.comparacao.periodo}). O maior da série em VGV segue sendo o ${g.maximo.periodo} (${fmtValor(g.maximo.valor, "BRL_MILHOES")}).`;
  const f = v.vso ? an.fontes[v.vso.fonte] : null;
  return el("article", { class: "prova", "aria-labelledby": "prova-venda" },
    el("h3", { class: "prova-tema", id: "prova-venda" }, "Venda"),
    el("p", { class: "prova-numero" }, nf(u.valor, 0), el("small", {}, " unidades")),
    el("p", { class: "prova-rotulo" }, `Vendas líquidas, ${u.periodo}`),
    el("p", { class: "prova-meta" }, chipRecorde(u), chipAA(u)),
    el("p", { class: "prova-leitura" }, vgvTexto),
    v.vso ? el("p", { class: "prova-vso" }, v.vso.texto, " ", f ? externo(f.url, `${f.documento}, p. ${v.vso.pagina}`) : null) : null,
    el("p", { class: "prova-fonte" }, "Fonte: ", fonteLink(ds, "unidades, planilha oficial", u.origem), "; ", fonteLink(ds, "VGV", g.origem), "."));
}

function provaBalanco(p, { ds }) {
  const b = p.balanco, a = b.ativo, pl = b.patrimonio, em = b.emprestimosCP;
  const max = Math.max(...b.receber.serie.map((x) => x.valor));
  return el("article", { class: "prova", "aria-labelledby": "prova-balanco" },
    el("h3", { class: "prova-tema", id: "prova-balanco" }, "Balanço"),
    el("p", { class: "prova-numero" }, fmtValor(a.atual.valor, "BRL_MILHOES", { bi: 1 })),
    el("p", { class: "prova-rotulo" }, `Ativo total, ${a.atual.periodo}, contra ${fmtValor(a.inicial.valor, "BRL_MILHOES", { bi: 1 })} em ${a.inicial.periodo}`),
    el("p", { class: "prova-meta" }, chipAA(a.atual)),
    el("p", { class: "prova-leitura" }, `Patrimônio líquido de ${fmtValor(pl.valor, "BRL_MILHOES")} no ${pl.periodo} (${fmtPct(pl.variacaoPct, 1)} contra ${pl.comparacao.periodo}).`),
    el("div", {},
      el("p", { class: "mb-titulo" }, "Contas a receber de clientes, curto prazo"),
      el("ul", { class: "minibarras", "aria-label": "Contas a receber de clientes, curto prazo, em R$ milhões" },
        b.receber.serie.map((x) => el("li", {}, el("span", {}, x.periodo), el("span", { class: "mb-trilho" }, el("span", { class: "mb-barra", style: `width:${(x.valor / max) * 100}%` })), el("span", { class: "mb-valor" }, fmtValor(x.valor, "BRL_MILHOES")))))),
    el("p", { class: "prova-contrapeso" }, el("strong", {}, "Contrapeso: "), `os empréstimos de curto prazo subiram ${fmtPct(em.variacaoPct, 1)} contra o ${em.comparacao.periodo}, para ${fmtValor(em.valor, "BRL_MILHOES")}.`),
    el("p", { class: "prova-fonte" }, "Fonte: ", fonteLink(ds, "ativo", a.atual.origem), "; ", fonteLink(ds, "patrimônio líquido", pl.origem), "; ", fonteLink(ds, "empréstimos", em.origem), "."));
}

function iniciarProvas(ctx) {
  const p = C.provasSolidez(ctx.ix, ctx.an);
  limpar($("#provas-blocos")).append(provaTerreno(p, ctx), provaVenda(p, ctx), provaBalanco(p, ctx));
}

// ------------------------------------------------------------------ simulador de cobertura

function iniciarSimulador({ ix, ds }) {
  const s = C.simuladorCobertura(ix);
  const faixa = $("#cob-ritmo");
  const bi = (milhoes) => fmtValor(milhoes, "BRL_MILHOES", { bi: 2 });
  faixa.value = (Math.round((s.ltm / 1000) * 100) / 100).toFixed(2);
  $("#cob-min").textContent = fmtValor(Number(faixa.min) * 1000, "BRL_MILHOES", { bi: 1 });
  $("#cob-max").textContent = fmtValor(Number(faixa.max) * 1000, "BRL_MILHOES", { bi: 1 });
  const anos = limpar($("#cob-anos"));
  const caixas = Array.from({ length: 12 }, () => el("span", {}, el("i")));
  anos.append(...caixas);
  const botoes = s.referencias.map((r) => el("button", { type: "button", "aria-pressed": "false", "data-milhoes": r.milhoes, onclick: () => { faixa.value = (Math.round((r.milhoes / 1000) * 100) / 100).toFixed(2); atualizar(); } }, `${r.rotulo}: ${bi(r.milhoes)}`));
  limpar($("#cob-presets")).append(...botoes);

  function atualizar() {
    const ritmo = Number(faixa.value) * 1000;
    const a = C.coberturaAnos(s.landbank, ritmo);
    $("#cob-saida").textContent = fmtValor(a, "anos");
    $("#cob-sub").textContent = `de lançamentos no ritmo de ${bi(ritmo)} por ano`;
    $("#cob-conta").textContent = `${fmtValor(s.landbank, "BRL_MILHOES", { bi: 1 })} ÷ ${bi(ritmo)} por ano = ${fmtValor(a, "anos")}`;
    C.blocosCobertura(a).forEach((f, i) => { caixas[i].firstChild.style.width = `${f * 100}%`; });
    botoes.forEach((b) => b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset.milhoes) / 1000 - Number(faixa.value)) < 0.005)));
    faixa.setAttribute("aria-valuetext", `${bi(ritmo)} por ano, ${fmtValor(a, "anos")} de cobertura`);
  }
  faixa.addEventListener("input", atualizar);
  atualizar();
  limpar($("#cob-fonte")).append(`Landbank de ${s.periodo} e lançamentos dos últimos 12 meses. Fonte: `, fonteLink(ds, "landbank, planilha oficial", s.origem), ".");
}

// ------------------------------------------------------------------ índice de solidez

const sinalNum = (n, casas) => `${n >= 0 ? "+" : "-"}${nf(Math.abs(n), casas)}`;
const ROTULO_SELO = { atencao: "Atenção", confortavel: "Confortável", sem_historico: "Sem histórico" };
const CLASSE_SELO = { atencao: "chip chip-selo-atencao", confortavel: "chip chip-selo-confortavel", sem_historico: "chip chip-neutro" };

function pagsTexto(pagina) {
  return pagina === null || pagina === undefined ? "" : `, p. ${[].concat(pagina).join(" e ")}`;
}

function contextoAlavancagem({ an }) {
  const total = an.citacoes_de_release.divida_liquida_sobre_pl_3T26;
  const corp = an.citacoes_de_release.divida_corporativa_sobre_pl_3T26;
  const plano = an.eventos.find((e) => e.titulo === "Plano27");
  const link = (c) => externo(an.fontes[c.fonte].url, `${an.fontes[c.fonte].documento}${pagsTexto(c.pagina)}`);
  return el("p", { class: "indice-contexto" }, el("strong", {}, "Contexto do release: "),
    `${nf(total.valor, 0)}%: ${total.texto} `, link(total), ". ",
    `${corp.texto} `, link(corp), ". ", plano ? [plano.texto, " ", link(plano), "."] : null);
}

function cartaoIndice(a, ctx, sparks) {
  const u = a.unidade;
  const h = a.historico;
  const spark = el("div", { class: "spark-area" });
  const descricao = a.atual
    ? `${a.nome}, de ${h.de} a ${a.atual.periodo}. Atual ${fmtValor(a.atual.valor, u)}, média histórica ${fmtValor(h.media, u)}.`
    : a.nome;
  if (a.atual) sparks.push({ alvo: spark, serie: a.serie, media: h.media, descricao });
  const termos = a.termos ?? [];
  return el("article", { class: "indice-cartao", "data-chave": a.chave, "aria-labelledby": `ind-${a.chave}` },
    el("div", { class: "indice-topo" }, el("h3", { id: `ind-${a.chave}` }, a.nome), el("span", { class: CLASSE_SELO[a.selo] }, ROTULO_SELO[a.selo])),
    a.atual ? el("p", { class: "indice-valor" }, fmtValor(a.atual.valor, u)) : el("p", { class: "indice-valor" }, ND),
    a.atual ? el("p", { class: "indice-periodo" }, `${a.atual.periodo}, último trimestre com todas as entradas`) : null,
    spark,
    a.atual ? el("p", { class: "indice-posicao" }, "Média histórica ", el("strong", {}, fmtValor(h.media, u)), ` (${h.de} em diante, ${h.n} trimestres anteriores). Hoje: `,
      el("strong", {}, fmtValor(a.atual.valor, u)), `. z-score ${a.zscore === null ? ND : sinalNum(a.zscore, 2)}; percentil ${nf(a.percentil, 0)} da própria série.`) : null,
    a.atual ? el("p", { class: "indice-regra" }, `Melhor é ${a.sentido === "maior_melhor" ? "maior" : "menor"}. Posição de qualidade: ${nf(a.qualidade, 0)} de 100. O selo vira "atenção" abaixo de ${a.corte}.`) : null,
    a.chave === "alavancagem" ? contextoAlavancagem(ctx) : null,
    el("details", {}, el("summary", {}, "Ver a fórmula e a conta"),
      el("p", { class: "conta-formula" }, a.formula),
      el("ul", { class: "conta-lista" }, termos.map((t) => el("li", {}, el("span", {}, t.rotulo), el("span", {}, fmtValor(t.valor, t.unidade)))),
        a.atual ? el("li", { class: "conta-resultado" }, el("span", {}, `Resultado, ${a.atual.periodo}`), el("span", {}, fmtValor(a.atual.valor, u))) : null)));
}

function iniciarComposto(av) {
  const caixa = limpar($("#composto-pesos"));
  const pesos = Object.fromEntries(av.map((a) => [a.chave, 1]));
  const campos = [];
  const atualizar = () => {
    const r = C.solidezComposto(av, pesos);
    $("#composto-nota").textContent = r ? `${nf(r.nota, 0)} de 100` : ND;
    $("#composto-detalhe").textContent = r
      ? `Média ponderada da posição de ${r.usados.length} medida(s) na própria história. Peso total ${r.pesoTotal}. Não é um indicador publicado pela companhia.`
      : "Defina um peso maior que zero em ao menos uma medida.";
  };
  for (const a of av) {
    const id = `peso-${a.chave}`;
    const saida = el("output", { for: id }, "1");
    const campo = el("input", { type: "range", id, min: "0", max: "5", step: "1", value: "1" });
    campo.addEventListener("input", () => { pesos[a.chave] = Number(campo.value); saida.textContent = campo.value; atualizar(); });
    campos.push([campo, saida, a.chave]);
    caixa.append(el("div", { class: "peso" }, el("label", { for: id }, a.nome), campo, saida));
  }
  $("#composto-reset").addEventListener("click", () => {
    for (const [campo, saida, chave] of campos) { campo.value = "1"; saida.textContent = "1"; pesos[chave] = 1; }
    atualizar();
  });
  atualizar();
}

function iniciarIndice(ctx) {
  const av = C.indiceSolidez(ctx.ix);
  const sparks = [];
  const corte = av[0].corte;
  const legenda = el("article", { class: "indice-cartao indice-legenda", "aria-labelledby": "ind-legenda" },
    el("h3", { id: "ind-legenda" }, "Como ler cada cartão"),
    el("ul", { class: "legenda-lista" },
      el("li", {}, el("strong", {}, "Linha contínua: "), "a medida em cada trimestre."),
      el("li", {}, el("strong", {}, "Linha tracejada: "), "a média histórica da própria Patrimar."),
      el("li", {}, el("strong", {}, "Ponto verde: "), "o valor mais recente."),
      el("li", {}, el("strong", {}, "Interrupção na linha: "), "trimestre sem todas as entradas. Nunca é preenchido com zero."),
      el("li", {}, el("strong", {}, "Selo: "), `"atenção" quando a posição de qualidade na própria história fica abaixo de ${corte} em 100. É uma regra mecânica, não um julgamento sobre a companhia.`),
      el("li", {}, el("strong", {}, "Percentil: "), "fatia dos trimestres anteriores com valor abaixo do atual.")));
  limpar($("#indice-cartoes")).append(...av.map((a) => cartaoIndice(a, ctx, sparks)), legenda);
  const desde = av.find((a) => a.historico)?.historico.de;
  $("#indice-intro").textContent = `Cada medida é calculada trimestre a trimestre a partir da planilha oficial, com a fórmula à vista. A posição compara o valor de hoje com a média e a distribuição da própria Patrimar${desde ? `, desde o ${desde}` : ""}. Não há comparação com outras empresas: a base não traz esses dados. O selo é mecânico: "atenção" quando a medida está no quarto pior da própria história. São medidas calculadas pela GSA, não indicadores divulgados pela companhia. O giro de vendas sobre estoque não entra porque a planilha não traz estoque em VGV.`;
  const desenhar = (s, forcar) => {
    const L = Math.round(s.alvo.clientWidth);
    if (!L || (!forcar && Math.abs(L - (s.largura ?? 0)) < 4)) return;
    s.largura = L;
    desenharSparkline(s.alvo, s.serie, { media: s.media, descricao: s.descricao, largura: L });
  };
  sparks.forEach((s) => {
    desenhar(s, true);
    if ("ResizeObserver" in window) new ResizeObserver(() => desenhar(s, false)).observe(s.alvo);
  });
  iniciarComposto(av);
}

// ------------------------------------------------------------------ pontos de atenção

const TAG_REGRA = { piora_aa: "Piora a/a", piora_anual: "Piora anual", percentil: "Posição baixa", negativo: "Negativo" };

function textoMotivo(m) {
  switch (m.regra) {
    case "piora_aa": return `Piorou ${nf(m.pioraPct, 1)}% contra o ${m.contra}`;
    case "piora_anual": return `Piorou ${nf(m.pioraPct, 1)}% contra ${m.contra}`;
    case "percentil": return `Abaixo do percentil ${m.corte} da própria série (posição ${nf(m.posicao, 0)} de 100${m.posicao === 0 ? ", o pior ponto da série" : ""})`;
    case "negativo": return "Valor negativo";
    default: return m.regra;
  }
}

function textoComparacao(p) {
  if (!p.comparacao || p.comparacao.valor === null) return ND;
  const base = `${p.comparacao.periodo}: ${fmtValor(p.comparacao.valor, p.unidade)}`;
  if (p.unidade === "PERCENTUAL") return `${base} (${sinalNum(p.valor - p.comparacao.valor, 1)} p.p.)`;
  return p.valor > 0 && p.comparacao.valor > 0 && p.comparacao.variacaoPct !== null ? `${base} (${fmtPct(p.comparacao.variacaoPct, 1)})` : base;
}

function iniciarAtencao({ ix, an }) {
  const r = an.regras_pontos_de_atencao;
  const linhas = C.pontosDeAtencao(ix, r, an.pontos_de_atencao);
  const monitorados = r.indicadores_chave.map((c) => ix.ind.get(c.id).rotulo).join("; ");
  $("#atencao-regras").textContent = `Entra na lista todo indicador-chave que, nos últimos ${C.JANELA_PONTOS} trimestres com dado, piorou mais de ${r.piora_aa_pct}% contra o mesmo trimestre do ano anterior, ficou abaixo do percentil ${r.percentil} da própria série ou é negativo (lucro e caixa), mais as comparações anuais cadastradas. A lista é gerada pelo código a cada carga. Contexto e contrapeso são texto editorial de anotacoes.json, cada um com documento e página. Indicadores monitorados: ${monitorados}.`;
  const corpo = limpar($("#tabela-atencao tbody"));
  for (const p of linhas) {
    const f = p.fonte ? an.fontes[p.fonte] : null;
    corpo.append(el("tr", { "data-id": p.id, "data-periodo": p.periodo },
      el("th", { scope: "row", "data-rotulo": "Indicador" }, p.rotulo, el("span", { class: "sub periodo-linha" }, p.periodo)),
      el("td", { class: "numero-comp", "data-rotulo": "Número" }, el("strong", { class: "numero-linha" }, fmtValor(p.valor, p.unidade)), el("span", { class: "sub comparacao-linha" }, textoComparacao(p))),
      el("td", { "data-rotulo": "Por que entrou" }, el("ul", { class: "motivos" }, p.motivos.map((m) => el("li", {}, el("span", { class: "tag-regra" }, TAG_REGRA[m.regra] ?? m.regra), textoMotivo(m))))),
      el("td", { class: "contexto", "data-rotulo": "Contexto" }, p.semContexto ? "Contexto ainda não cadastrado em anotacoes.json." : p.contexto),
      el("td", { class: "contrapeso", "data-rotulo": "Contrapeso" }, p.semContexto ? ND : p.contrapeso),
      el("td", { "data-rotulo": "Fonte" }, f ? externo(f.url, `${f.documento}${pagsTexto(p.pagina)}`) : ND)));
  }
  $("#atencao-nota").textContent = "Pontos de atenção não são recomendação de investimento nem previsão: são os números menos confortáveis do período, com o contexto que a própria companhia informa.";
}

// ------------------------------------------------------------------ explorador de séries

const UNID_ROTULO = { BRL_MILHOES: "R$ milhões", PERCENTUAL: "%", UNIDADES: "unidades", BRL_MIL_POR_UNIDADE: "R$ mil por unidade" };
const GRAN_ROTULO = { tri: "trimestral", ltm: "12 meses móveis", ano: "anual" };
const PRESETS_EXP = [
  { rotulo: "Lançamentos e vendas (VGV)", a: 1, b: 9, g: "tri" },
  { rotulo: "Receita e lucro líquido", a: 25, b: 40, g: "tri" },
  { rotulo: "Vendas em unidades e preço médio", a: 13, b: 17, g: "tri" },
  { rotulo: "Caixa operacional, 12 meses", a: 73, b: null, g: "ltm" },
  { rotulo: "Receita e lucro, anual", a: 25, b: 40, g: "ano" },
];
const estadoExp = { a: 1, b: 9, g: "tri", ev: true };

function lerEstadoURL(ix) {
  const q = new URLSearchParams(location.search);
  const id = (v) => (v !== null && v !== "" && ix.ind.has(Number(v)) ? Number(v) : null);
  if (q.has("a") && id(q.get("a")) !== null) estadoExp.a = id(q.get("a"));
  if (q.has("b")) estadoExp.b = id(q.get("b"));
  if (C.GRANULARIDADES.includes(q.get("g"))) estadoExp.g = q.get("g");
  if (q.has("ev")) estadoExp.ev = q.get("ev") !== "0";
}

function gravarEstadoURL() {
  const q = new URLSearchParams({ a: String(estadoExp.a), b: estadoExp.b === null ? "" : String(estadoExp.b), g: estadoExp.g, ev: estadoExp.ev ? "1" : "0" });
  try { history.replaceState(null, "", `?${q}${location.hash}`); } catch (_) { /* sem histórico: a visão continua funcionando */ }
}

function fmtTick(unidade) {
  return (v, passo) => `${nf(v, passo < 1 ? 1 : 0)}${unidade === "PERCENTUAL" ? "%" : ""}`;
}

function textoComp(c, unidade) {
  if (!c) return ND;
  if (c.tipo === "pct") return fmtPct(c.valor, 1);
  if (c.tipo === "pp") return `${sinalNum(c.valor, 1)} p.p.`;
  return `diferença de ${c.valor < 0 ? "-" : "+"}${fmtValor(Math.abs(c.valor), unidade)}`;
}

function montarSeriesExp(ix) {
  const lista = [];
  const avisos = [];
  for (const [chave, id] of [["A", estadoExp.a], ["B", estadoExp.b]]) {
    if (id === null) continue;
    const s = C.serieExplorador(ix, id, estadoExp.g);
    if (s.erro) { avisos.push(s.erro); continue; }
    lista.push({ ...s, chave });
  }
  const dual = new Set(lista.map((s) => s.unidade)).size > 1;
  lista.forEach((s, i) => { s.eixo = dual && i === 1 ? "dir" : "esq"; });
  return { lista, avisos, dual };
}

function cartaoLeitura(s, leitura) {
  const fmt = (v) => fmtValor(v, s.unidade);
  const marcaLinha = (tipo, m, rotulo) => {
    if (!m) return null;
    return el("li", { "data-marca": tipo }, el("span", {}, rotulo),
      el("span", {}, m.periodo === null ? `sem ${tipo === "recorde" ? "recorde" : "mínimo"} único: o valor ${fmt(m.valor)} se repete` : `${fmt(m.valor)} em ${m.periodo}`));
  };
  const comp = (rotulo, c) => (c ? el("li", { "data-comp": rotulo }, el("span", {}, `${rotulo} (${c.periodo}: ${c.valor === null ? ND : fmt(c.valor)})`), el("span", {}, textoComp(c.comp, s.unidade))) : null);
  return el("article", { class: "ex-cartao", "data-serie": s.chave },
    el("h3", {}, el("span", { class: `chave-${s.chave}`, "aria-hidden": "true" }), `${s.chave}: ${s.rotulo}`),
    el("p", { class: "ex-valor" }, fmt(leitura.valor)),
    el("p", { class: "nota" }, `${leitura.periodo}, ${GRAN_ROTULO[s.granularidade]}, ${UNID_ROTULO[s.unidade] ?? s.unidade}${leitura.eRecorde ? ". Recorde da série exibida." : leitura.eMinimo ? ". Mínimo da série exibida." : "."}`),
    el("ul", { class: "ex-lista" },
      comp(`Contra o ${s.granularidade === "ano" ? "ano anterior" : "mesmo trimestre do ano anterior"}`, leitura.aa),
      comp("Contra o período anterior", leitura.tt),
      marcaLinha("recorde", leitura.recorde, "Recorde da série exibida"),
      marcaLinha("minimo", leitura.minimo, "Mínimo da série exibida")),
    el("p", { class: "nota" }, "Fonte: ", celulaLink(ctxGlobal.ds, "planilha oficial", `linha ${s.linha}`),
      ...C.periodosDeDocumento(ctxGlobal.ix, s.id).map((per) => {
        const o = C.origemValor(ctxGlobal.ix, s.id, per);
        return [`; o ${per} vem do `, fonteLink(ctxGlobal.ds, "", o), "."];
      }).flat()));
}

function tabelaExp(lista) {
  const cab = limpar($("#ex-tabela thead"));
  const corpo = limpar($("#ex-tabela tbody"));
  const cols = ["Período"];
  for (const s of lista) cols.push(`${s.chave}: ${s.rotulo}`, `${s.chave} a/a`, ...(s.lagTT ? [`${s.chave} t/t`] : []));
  cab.append(el("tr", {}, cols.map((t, i) => el("th", { scope: "col", class: i ? "num" : null }, t))));
  const periodos = lista[0].periodos;
  periodos.forEach((p, k) => {
    if (lista.every((s) => s.valores[k] === null)) return;
    const celulas = [el("th", { scope: "row" }, p)];
    for (const s of lista) {
      const v = s.valores[k];
      const aa = k - s.lagAA >= 0 ? C.compararValores(v, s.valores[k - s.lagAA], s.unidade) : null;
      const tt = s.lagTT && k - s.lagTT >= 0 ? C.compararValores(v, s.valores[k - s.lagTT], s.unidade) : null;
      celulas.push(el("td", { class: "num" }, fmtValor(v, s.unidade)), el("td", { class: "num" }, textoComp(aa, s.unidade)), ...(s.lagTT ? [el("td", { class: "num" }, textoComp(tt, s.unidade))] : []));
    }
    corpo.append(el("tr", {}, celulas));
  });
}

/** Corta o vazio do começo do eixo (períodos em que NENHUMA série tem dado). O vazio do fim fica: mostra a ausência. */
function aparar(lista) {
  const primeiros = lista.map((s) => s.valores.findIndex((v) => v !== null)).filter((i) => i >= 0);
  const primeiro = primeiros.length ? Math.min(...primeiros) : 0;
  return primeiro === 0 ? lista : lista.map((s) => ({ ...s, periodos: s.periodos.slice(primeiro), valores: s.valores.slice(primeiro) }));
}

function desenharExploradorTela(ctx, largura) {
  const { ix, an } = ctx;
  const { lista, avisos, dual } = montarSeriesExp(ix);
  const alvo = $("#ex-grafico");
  $("#ex-aviso").textContent = avisos.join(" ");
  $("#ex-grafico").closest("figure").dataset.series = lista.map((s) => s.chave).join("");
  const leitura = limpar($("#ex-leitura"));
  const listaEv = limpar($("#ex-eventos-lista"));
  if (!lista.length) {
    limpar(alvo).append(el("p", { class: "vazio" }, "Nenhuma série para mostrar. Escolha outro indicador ou outra visão."));
    limpar($("#ex-legenda"));
    limpar($("#ex-tabela thead")); limpar($("#ex-tabela tbody"));
    return;
  }
  const plot = aparar(lista);
  const periodos = plot[0].periodos;
  const g = estadoExp.g;
  const eventos = estadoExp.ev ? C.eventosNoEixo(an.eventos, periodos, g).map((e, i) => ({ ...e, numero: i + 1 })) : [];
  const leituras = lista.map((s) => C.leituraSerie(s));
  const descricao = `${lista.map((s, i) => `${s.chave}: ${s.rotulo}, ${leituras[i] ? `último valor ${fmtValor(leituras[i].valor, s.unidade)} em ${leituras[i].periodo}` : "sem dados"}`).join(". ")}. Visão ${GRAN_ROTULO[g]}, de ${periodos[0]} a ${periodos[periodos.length - 1]}.${dual ? " Dois eixos com escalas diferentes." : ""}`;
  desenharExplorador(alvo, {
    largura, descricao, periodos,
    rotulosX: periodos.map((p, i) => g === "ano" || p.startsWith("4T") || i === periodos.length - 1),
    series: plot.map((s) => ({ chave: s.chave, valores: s.valores, eixo: s.eixo, rotulo: s.rotulo, fmt: (v) => fmtValor(v, s.unidade, { bi: 1 }), marcas: C.marcasSerie(s) })),
    fmtEixo: { esq: fmtTick(lista.find((s) => s.eixo === "esq").unidade), dir: dual ? fmtTick(lista.find((s) => s.eixo === "dir").unidade) : null },
    eventos,
  });
  const esq = lista.filter((s) => s.eixo === "esq").map((s) => s.chave).join(" e ");
  const dir = lista.filter((s) => s.eixo === "dir").map((s) => s.chave).join(" e ");
  const unid = (chave) => UNID_ROTULO[lista.find((s) => s.chave === chave[0]).unidade] ?? "";
  $("#ex-legenda").textContent = `Visão ${GRAN_ROTULO[g]}. Eixo esquerdo: ${esq}, em ${unid(esq)}.${dual ? ` Eixo direito: ${dir}, em ${unid(dir)}. Duas escalas diferentes: não leia o cruzamento das linhas como relação entre os indicadores.` : ""} Escala sempre a partir de zero. Lacunas na linha são períodos sem dado, nunca preenchidos com zero.${g === "ltm" ? " Doze meses móveis somam 4 trimestres e só existem onde os 4 estão publicados." : ""}`;
  leituras.forEach((l, i) => { if (l) leitura.append(cartaoLeitura(lista[i], l)); });
  eventos.forEach((e) => {
    const f = an.fontes[e.fonte];
    listaEv.append(el("li", { "data-evento": e.numero }, el("span", { class: "num-evento", "aria-hidden": "true" }, e.numero),
      el("span", {}, el("strong", {}, `${e.titulo} (${e.periodoEixo}). `), e.texto, " ", f ? externo(f.url, `${f.documento}${pagsTexto(e.pagina)}`) : null)));
  });
  tabelaExp(lista);
}

let ctxGlobal = null;

function iniciarExplorador(ctx) {
  ctxGlobal = ctx;
  const { ix, ds } = ctx;
  lerEstadoURL(ix);
  const grupos = [["OPERACIONAL", "Operacional"], ["DRE", "Resultado (DRE)"], ["FLUXO_CAIXA", "Fluxo de caixa"], ["BALANCO", "Balanço"]];
  const montar = (sel, comNenhum) => {
    limpar(sel);
    if (comNenhum) sel.append(el("option", { value: "" }, "Nenhum"));
    for (const [secao, nome] of grupos) {
      const tem = (i) => i.tri.some((v) => v !== null) || i.ano.some((v) => v !== null);
      sel.append(el("optgroup", { label: nome }, ds.indicadores.filter((i) => i.secao === secao && tem(i)).map((i) => el("option", { value: String(i.id) }, i.rotulo))));
    }
  };
  const selA = $("#ex-a"), selB = $("#ex-b");
  montar(selA, false);
  montar(selB, true);
  const sincronizar = () => {
    selA.value = String(estadoExp.a);
    selB.value = estadoExp.b === null ? "" : String(estadoExp.b);
    $("#ex-ev").checked = estadoExp.ev;
    document.querySelectorAll("#ex-g button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.g === estadoExp.g)));
    document.querySelectorAll("#ex-presets button").forEach((b, i) => {
      const p = PRESETS_EXP[i];
      b.setAttribute("aria-pressed", String(p.a === estadoExp.a && p.b === estadoExp.b && p.g === estadoExp.g));
    });
  };
  const alvo = $("#ex-grafico");
  let larguraAtual = 0;
  const redesenhar = (forcar) => {
    const L = Math.round(alvo.clientWidth);
    if (!L) return;
    if (!forcar && Math.abs(L - larguraAtual) < 4) return;
    larguraAtual = L;
    desenharExploradorTela(ctx, L);
  };
  const mudou = () => { sincronizar(); gravarEstadoURL(); redesenhar(true); };
  selA.addEventListener("change", () => { estadoExp.a = Number(selA.value); mudou(); });
  selB.addEventListener("change", () => { estadoExp.b = selB.value === "" ? null : Number(selB.value); mudou(); });
  $("#ex-ev").addEventListener("change", (e) => { estadoExp.ev = e.target.checked; mudou(); });
  document.querySelectorAll("#ex-g button").forEach((b) => b.addEventListener("click", () => { estadoExp.g = b.dataset.g; mudou(); }));
  limpar($("#ex-presets")).append(...PRESETS_EXP.map((p) => el("button", { type: "button", "aria-pressed": "false", onclick: () => { Object.assign(estadoExp, { a: p.a, b: p.b, g: p.g }); mudou(); } }, p.rotulo)));
  sincronizar();
  redesenhar(true);
  if ("ResizeObserver" in window) new ResizeObserver(() => redesenhar(false)).observe(alvo);
  iniciarSazonalidade(ctx);
}

function iniciarSazonalidade({ ix }) {
  const alvo = limpar($("#sazonalidade-paineis"));
  const inicio = ix.tri.find((p) => C.valor(ix, 1, p) !== null);
  const fim = ix.tri[ix.tri.length - 1];
  $("#saz-intro").textContent = `Média de cada trimestre do ano (1T a 4T), de ${inicio} a ${fim}, só com dados existentes. A participação é a média do trimestre dividida pela soma das quatro médias. São poucas observações por trimestre: é um retrato histórico, não uma previsão.`;
  for (const id of [1, 9]) {
    const s = C.sazonalidade(ix, id);
    const trs = [1, 2, 3, 4];
    const maxMedia = Math.max(...trs.map((t) => s[t].media));
    const alto = trs.reduce((a, t) => (s[t].parte > s[a].parte ? t : a), 1);
    const baixo = trs.reduce((a, t) => (s[t].parte < s[a].parte ? t : a), 1);
    alvo.append(el("article", { class: "saz-painel", "data-id": id },
      el("h4", {}, `${ix.ind.get(id).rotulo}, em R$ milhões`),
      el("ul", { class: "saz-barras", "aria-label": `${ix.ind.get(id).rotulo}: média por trimestre do ano` },
        trs.map((t) => el("li", { "data-tri": t }, el("span", {}, `${t}T`), el("span", { class: "mb-trilho" }, el("span", { class: "mb-barra", style: `width:${(s[t].media / maxMedia) * 100}%` })),
          el("span", { class: "saz-v" }, fmtValor(s[t].media, "BRL_MILHOES")), el("span", { class: "saz-p" }, `${nf(s[t].parte, 1)}%`)))),
      el("p", { class: "nota" }, `O ${alto}º trimestre pesa mais (${nf(s[alto].parte, 1)}%) e o ${baixo}º pesa menos (${nf(s[baixo].parte, 1)}%). Cada média usa ${s[1].n} observações por trimestre.`)));
  }
}

// ------------------------------------------------------------------ assistente

function iniciarAssistente({ ds, an }) {
  const bot = criarAssistente(ds, an);
  const lista = limpar($("#chat-mensagens"));
  lista.append(el("li", { class: "msg msg-assistente", "data-papel": "saudacao" },
    el("div", { class: "msg-texto" }, "Olá. Pergunte sobre os indicadores ou os documentos públicos de RI da Patrimar. Toda resposta traz o período, o valor e o link da fonte; se o dado não existe na base, eu digo.")));
  const perguntar = (texto) => {
    const t = texto.trim();
    if (!t) return;
    lista.append(el("li", { class: "msg msg-usuario", "data-papel": "usuario" }, el("div", { class: "msg-texto" }, t)));
    const r = bot.perguntar(t);
    const meta = el("div", { class: "msg-meta" },
      r.period ? el("span", { class: "chip chip-neutro" }, `Período: ${r.period}`) : null,
      r.source_url ? ["Fonte: ", externo(r.source_url, r.source_label ?? "fonte", "msg-fonte")] : null);
    const resposta = el("li", { class: `msg msg-assistente${r.status === "missing" ? " msg-ausente" : ""}`, "data-papel": "assistente", "data-status": r.status, "data-intent": r.intent },
      el("div", { class: "msg-texto" }, r.answer), meta);
    lista.append(resposta);
    lista.scrollTop = Math.max(0, resposta.offsetTop - 12); // abre no começo da resposta nova, não no fim
  };
  const campo = $("#chat-pergunta");
  $("#chat-form").addEventListener("submit", (e) => { e.preventDefault(); perguntar(campo.value); campo.value = ""; campo.focus(); });
  limpar($("#chat-sugestoes")).append(...PERGUNTAS_SUGERIDAS.map((p) => el("button", { type: "button", onclick: () => perguntar(p) }, p)));
  const inicial = new URLSearchParams(location.search).get("p");
  if (inicial) perguntar(inicial);
}

// ------------------------------------------------------------------ navegação

function iniciarNavegacao() {
  const links = [...document.querySelectorAll("nav a[href^='#']")];
  const secoes = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if (!("IntersectionObserver" in window)) return;
  const obs = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => {
        if (a.getAttribute("href") === `#${e.target.id}`) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }
  }, { rootMargin: "-35% 0px -60% 0px" });
  secoes.forEach((s) => obs.observe(s));
}

// ------------------------------------------------------------------ início

iniciarTema();
iniciarNavegacao();
carregar().then((ctx) => {
  iniciarAbertura(ctx);
  iniciarSkyline(ctx);
  iniciarProvas(ctx);
  iniciarSimulador(ctx);
  iniciarIndice(ctx);
  iniciarAtencao(ctx);
  iniciarPanorama(ctx);
  iniciarIndicadores(ctx);
  iniciarExplorador(ctx);
  iniciarAssistente(ctx);
  iniciarPainel(ctx);
  iniciarDocumentos(ctx);
  iniciarMetodologia(ctx);
  document.body.classList.add("pronto");
}).catch((erro) => {
  console.error(erro);
  const aviso = el("div", { class: "erro", role: "alert" },
    el("strong", {}, "Não foi possível carregar os dados. "),
    "O site precisa ser aberto por um servidor local: dê duplo clique em INICIAR.bat, na pasta do projeto. ",
    el("span", { class: "sub" }, `Detalhe técnico: ${erro.message}`));
  $("#principal").prepend(aviso);
});
