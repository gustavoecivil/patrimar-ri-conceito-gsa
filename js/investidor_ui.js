// Interface do olhar do investidor: comprador de imóvel e credor. Sem innerHTML com dados.
import * as C from "./calculos.js";
import * as I from "./investidor.js";
import { fmtValor, fmtPct, nf, ND } from "./formatar.js";

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
function limpar(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
  return n;
}
const pc = (x, c = 1) => (x === null ? ND : `${nf(x, c)}%`);
const NOME_UN = { "%": "%", x: "x", BRL_MILHOES: "BRL_MILHOES" };
const fmt = (valor, un) => (valor === null ? ND : un === "x" ? `${nf(valor, 2)}x` : un === "%" ? `${nf(valor, 1)}%` : fmtValor(valor, NOME_UN[un] ?? un, { bi: 2 }));
// quem sobe é bom (maior) ou ruim (menor); "neutro" não pinta
const SENTIDO = { bruta: "neutro", liquida: "menor", ebitda: "maior", cobertura: "maior", liquidaEbitda: "menor", jurosCaixa: "maior", perfil: "menor", recebiveis: "maior" };

function chipComparacao(c) {
  if (!c.comp) return el("span", { class: "chip chip-neutro" }, `Sem base de comparação (${ND})`);
  const sobe = c.comp.valor >= 0;
  const sentido = SENTIDO[c.chave];
  const bom = sentido === "neutro" ? null : sentido === "maior" ? sobe : !sobe;
  const classe = bom === null ? "chip-neutro" : bom ? "chip-bom" : "chip-atencao";
  const txt = c.comp.tipo === "pct" ? fmtPct(c.comp.valor, 1) : c.comp.tipo === "pp" ? `${sobe ? "+" : "-"}${nf(Math.abs(c.comp.valor), 1)} p.p.` : `diferença de ${nf(c.comp.valor, 2)}`;
  return el("span", { class: `chip ${classe}` }, el("span", { "aria-hidden": "true" }, sobe ? "▲ " : "▼ "), `${txt} contra ${c.periodoBase}`);
}

function cartaoCredor(c) {
  return el("article", { class: "medida", "data-medida": c.chave },
    el("p", { class: "medida-pergunta" }, c.pergunta),
    el("h4", {}, c.titulo),
    el("p", { class: "medida-valor" }, fmt(c.valor, c.unidade)),
    el("p", { class: "medida-meta" }, el("span", { class: "periodo" }, c.periodo), chipComparacao(c)),
    el("details", {},
      el("summary", {}, "A conta e o que ela quer dizer"),
      el("p", { class: "medida-formula" }, el("strong", {}, "Fórmula: "), c.formula),
      el("ul", { class: "medida-termos" }, c.termos.map((t) => el("li", {}, el("span", {}, t.rotulo), el("strong", {}, fmtValor(t.valor, t.unidade, { bi: 2 }))))),
      el("p", {}, el("strong", {}, "O que significa: "), c.significa),
      el("p", {}, el("strong", {}, "O que não significa: "), c.naoSignifica)),
    el("p", { class: "medida-fonte" }, "Fonte: planilha oficial e ITR 3T26; cálculo GSA."));
}

function iniciarCredor({ ix, an }) {
  const l = I.leituraCredor(ix, an);
  limpar($("#inv-credor-cartoes")).append(...l.cartoes.map(cartaoCredor));
  const m = l.medidas;
  $("#inv-credor-leitura").textContent = `No ${l.periodo}, a dívida líquida é de ${fmtValor(m.liquida, "BRL_MILHOES", { bi: 2 })} (${nf(m.alavancagemPct, 0)}% do patrimônio líquido) e o EBITDA de 12 meses cobre ${nf(m.coberturaJuros, 2)} vez as despesas financeiras. O caixa da operação em 12 meses foi de ${fmtValor(m.fco, "BRL_MILHOES")}, contra ${fmtValor(m.jurosPagos, "BRL_MILHOES")} de juros pagos. A contrapartida é o que a companhia tem a receber: ${nf(m.recebiveis / m.bruta, 2)} real de recebíveis para cada real de dívida bruta.`;
  $("#inv-credor-contexto").textContent = l.citacaoCorporativa
    ? `Segundo o release: ${l.citacaoCorporativa.texto} A dívida corporativa exclui o financiamento à construção, pago com os recebíveis das obras.`
    : "";
}

function cartaoMercado(rotulo, valor, nota) {
  return el("div", { class: "prova-item" }, el("p", { class: "prova-item-rotulo" }, rotulo), el("p", { class: "prova-item-valor" }, valor), nota ? el("p", { class: "prova-item-fonte" }, nota) : null);
}

function iniciarComprador({ ix, ext, an }) {
  const c = I.custoDeOportunidade(ix, ext);
  limpar($("#inv-mercado")).append(
    cartaoMercado(`CDI nos 12 meses até ${c.periodo}`, pc(c.cdi12m, 2), "Renda fixa: é o que o dinheiro rende sem risco de obra. Banco Central, SGS 4391."),
    cartaoMercado("IPCA em 12 meses", pc(c.ipca12m, 2), "Régua para o ganho real. Banco Central, SGS 433."),
    cartaoMercado("CDI acima da inflação", pc(c.cdiReal, 2), "Ganho real da renda fixa: (1 + CDI) ÷ (1 + IPCA) - 1."),
    cartaoMercado("Meta Selic", `${nf(c.selic, 2)}% ao ano`, "Taxa básica no fim do trimestre. SGS 432."),
    cartaoMercado("Juros do financiamento imobiliário", `${nf(c.jurosFinanciamento, 2)}% ao ano`, "Média do trimestre, recursos direcionados, pessoas físicas. SGS 20774."),
    cartaoMercado("INCC-M em 12 meses", pc(c.incc12m, 2), "Custo da obra. FGV, SGS 192."),
    cartaoMercado("Concessões de crédito imobiliário, 12 meses", fmtValor(c.concessoes12m, "BRL_MILHOES", { bi: 1 }), `${fmtPct(c.concessoesAA, 1)} contra os 12 meses anteriores. SGS 20704.`));

  // calculadora
  const campos = {
    aluguel: { id: "inv-aluguel", chave: "aluguelMensalPct", min: 0.2, max: 1, passo: 0.05, rot: "Aluguel mensal bruto, em % do preço do imóvel", un: "% ao mês" },
    custos: { id: "inv-custos", chave: "custosPct", min: 0, max: 50, passo: 5, rot: "Vacância, condomínio, IPTU e administração, em % do aluguel", un: "%" },
    valoriz: { id: "inv-valoriz", chave: "valorizacaoPct", min: -5, max: 15, passo: 0.5, rot: "Valorização do imóvel em 12 meses", un: "% ao ano" },
    financ: { id: "inv-financ", chave: "financiadoPct", min: 0, max: 80, passo: 10, rot: "Parte do preço financiada", un: "%" },
  };
  const estado = { ...I.PREMISSAS_INICIAIS };
  const form = limpar($("#inv-campos"));
  for (const f of Object.values(campos)) {
    form.append(el("div", { class: "campo-faixa" },
      el("label", { for: f.id }, f.rot, ": ", el("strong", { id: `${f.id}-valor` })),
      el("input", { id: f.id, type: "range", min: String(f.min), max: String(f.max), step: String(f.passo), value: String(estado[f.chave]) })));
  }
  const saida = () => I.retornoImovel({ ...estado, jurosFinanciamentoPct: c.jurosFinanciamento, cdiPct: c.cdi12m, ipcaPct: c.ipca12m });
  const linha = (rot, val, id, extra) => el("tr", {}, el("th", { scope: "row" }, rot), el("td", { class: "num", id }, val), el("td", {}, extra || ""));
  const desenhar = () => {
    for (const f of Object.values(campos)) $(`#${f.id}-valor`).textContent = `${nf(estado[f.chave], f.passo < 0.1 ? 2 : f.passo < 1 ? 1 : 0)} ${f.un}`;
    const r = saida();
    const corpo = limpar($("#inv-conta tbody"));
    corpo.append(...[
      linha("Aluguel líquido por ano, em % do preço", pc(r.aluguelLiquido, 2), "inv-r-aluguel", "aluguel mensal × 12 × (1 - custos)"),
      linha("Retorno total do imóvel (aluguel líquido + valorização)", pc(r.retornoTotal, 2), "inv-r-total", "antes de imposto"),
      linha(`CDI em 12 meses (${c.periodo})`, pc(c.cdi12m, 2), "inv-r-cdi", "o custo de oportunidade"),
      linha("Retorno do imóvel menos o CDI", `${r.spreadSobreCdi >= 0 ? "+" : "-"}${nf(Math.abs(r.spreadSobreCdi), 2)} p.p.`, "inv-r-spread", r.spreadSobreCdi >= 0 ? "o imóvel rende mais que a renda fixa nessas premissas" : "a renda fixa rende mais nessas premissas"),
      linha("Retorno real do imóvel (descontado o IPCA)", pc(r.retornoReal, 2), "inv-r-real", `IPCA em 12 meses: ${pc(c.ipca12m, 2)}`),
      linha("Valorização necessária para empatar com o CDI", pc(r.valorizacaoDeEmpate, 2), "inv-r-empate", "CDI menos o aluguel líquido"),
      estado.financiadoPct > 0 ? linha(`Retorno sobre o capital próprio, com ${estado.financiadoPct}% financiado a ${nf(c.jurosFinanciamento, 2)}% ao ano`, r.retornoCapitalProprio === null ? ND : pc(r.retornoCapitalProprio, 2), "inv-r-proprio", r.financiamentoAjuda ? "o financiamento aumenta o retorno" : "o financiamento custa mais do que o imóvel rende: reduz o retorno") : null].filter(Boolean));
  };
  for (const [nome, f] of Object.entries(campos)) {
    $(`#${f.id}`).addEventListener("input", (e) => { estado[f.chave] = Number(e.target.value); desenhar(); });
    void nome;
  }
  desenhar();

  // risco de entrega
  const s = I.sinaisDaObra(ix, an);
  const selo = (x) => (x.selo === "atencao" ? el("span", { class: "chip chip-selo-atencao" }, "Pede leitura com cuidado") : x.selo === "confortavel" ? el("span", { class: "chip chip-selo-confortavel" }, "Dentro do histórico") : el("span", { class: "chip chip-neutro" }, "Histórico curto"));
  limpar($("#inv-obra")).append(
    cartaoMercado("Cobertura do landbank", fmtValor(s.cobertura, "anos"), `Landbank de ${fmtValor(s.landbank, "BRL_MILHOES", { bi: 1 })} ÷ lançamentos de 12 meses (${fmtValor(s.lancamentos12m, "BRL_MILHOES", { bi: 2 })}). Cálculo GSA.`),
    cartaoMercado("Velocidade de vendas (VSO) em 12 meses", s.vso ? `${nf(s.vso.valor, 0)}%` : ND, s.vso ? `${s.vso.texto} Fonte: Prévia Operacional 3T26, p. ${s.vso.pagina}.` : "Sem leitura."),
    cartaoMercado("Unidades vendidas em 12 meses", `${nf(s.unidades12m, 0)} un.`, `Contra ${nf(s.unidades12mAnterior, 0)} nos 12 meses anteriores. Planilha oficial.`),
    cartaoMercado("Adiantamentos de clientes sobre a dívida bruta", s.adiantamentosSobreDivida === null ? ND : `${nf(s.adiantamentosSobreDivida, 2)}x`, `Dinheiro dos compradores que já financia obras: ${fmtValor(s.adiantamentos, "BRL_MILHOES")} (curto e longo prazo). Planilha oficial e ITR.`),
    cartaoMercado("Valor médio por unidade vendida, 12 meses", fmtValor(s.ticketMedio12m, "BRL_MIL_POR_UNIDADE"), "VGV vendido ÷ unidades. Muda com o mix de produtos: não é preço por metro quadrado nem índice de valorização."));
  limpar($("#inv-selos")).append(...s.selos.map((x) => el("li", {}, el("span", {}, x.nome), selo(x))));
}

export function iniciarInvestidor(ctx) {
  iniciarComprador(ctx);
  iniciarCredor(ctx);
  const botoes = [...document.querySelectorAll("#inv-lente button")];
  const paineis = { comprador: $("#inv-comprador"), credor: $("#inv-credor") };
  const mostrar = (lente) => {
    for (const [k, p] of Object.entries(paineis)) p.hidden = k !== lente;
    for (const b of botoes) b.setAttribute("aria-pressed", String(b.dataset.lente === lente));
  };
  for (const b of botoes) b.addEventListener("click", () => mostrar(b.dataset.lente));
  const pedida = new URLSearchParams(location.search).get("inv");
  mostrar(pedida === "credor" ? "credor" : "comprador");   // ?inv=credor abre a leitura do credor
  void C;
}
