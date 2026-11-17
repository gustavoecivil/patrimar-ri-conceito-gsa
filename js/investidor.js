// O olhar do investidor: duas leituras da Patrimar com as medidas que um profissional usa.
//  - Comprador de imóvel: retorno do ativo contra o custo de oportunidade, e o risco de a obra ser entregue.
//  - Credor (debenturista): endividamento, cobertura de juros, perfil da dívida e caixa.
// Funções PURAS, sem DOM. Tudo vem da base já auditada (data_site.json) e das séries públicas (data_externos.json).
// Medida que depende de dado ausente é null (n/d), nunca zero. EBITDA e coberturas são cálculo GSA, com a fórmula à vista.
import * as C from "./calculos.js";
import * as X from "./comparadores.js";

const v = (ix, id, k) => (ix.ind.get(id)?.tri[k] ?? null);
const soma12 = (ix, id, k) => C.somaJanela(ix.ind.get(id).tri, k);
const div = (a, b) => (a === null || b === null || b === 0 ? null : a / b);
const diff = (a, b) => (a === null || b === null ? null : a - b);

/** Medidas do credor num trimestre (índice k). Tudo em R$ milhões, salvo razões. */
export function medidasCredor(ix, k) {
  const emp = [v(ix, 115, k), v(ix, 128, k)];
  const bruta = emp.some((x) => x === null) ? null : emp[0] + emp[1];
  const termos = C.termosSolidez(ix, "alavancagem", k);          // [empréstimos, caixa e títulos (inclui longo prazo do ITR), patrimônio líquido]
  const caixaTvm = termos[1].valor;
  const liquida = diff(termos[0].valor, caixaTvm);
  const pl = termos[2].valor;
  const ebit = soma12(ix, 34, k), da = soma12(ix, 45, k);
  const ebitda = ebit === null || da === null ? null : ebit + da;
  const despFin = soma12(ix, 36, k), jurosPagos = soma12(ix, 71, k), fco = soma12(ix, 73, k);
  const pos = (x) => (x === null || x >= 0 ? null : -x);            // despesa e juros pagos vêm negativos: vira valor positivo; sinal trocado vira n/d
  const dFin = pos(despFin), jPag = pos(jurosPagos);
  return {
    periodo: ix.tri[k],
    bruta, cpPct: bruta === null || bruta === 0 ? null : (emp[0] / bruta) * 100,
    caixaTvm, liquida, pl, alavancagemPct: div(liquida, pl) === null ? null : (liquida / pl) * 100,
    ebit, da, ebitda, despFin: dFin, jurosPagos: jPag, fco,
    coberturaJuros: ebitda === null ? null : div(ebitda, dFin),
    liquidaSobreEbitda: ebitda === null || ebitda <= 0 || liquida === null ? null : liquida / ebitda,
    jurosPagosSobreEbitda: ebitda === null || ebitda <= 0 ? null : div(jPag, ebitda),
    caixaOperacionalSobreJuros: div(fco, jPag),
    emprestimosCP: emp[0], emprestimosLP: emp[1],
    recebiveis: (() => { const a = v(ix, 95, k), b = v(ix, 102, k); return a === null || b === null ? null : a + b; })(),
  };
}

const textoC = {
  bruta: { significa: "É o que a companhia deve a bancos e a debenturistas, de curto e longo prazo. Inclui o financiamento à construção, que é pago com os recebíveis dos clientes.", naoSignifica: "Não é a dívida corporativa do release (sem o financiamento à obra), que é menor e tem leitura própria." },
  liquida: { significa: "Dívida bruta menos caixa e títulos. Mostra o que ficaria a pagar se todo o caixa fosse usado na dívida.", naoSignifica: "O caixa também paga obra e fornecedores: não está livre para quitar dívida." },
  ebitda: { significa: "Resultado operacional mais depreciação e amortização, dos últimos 12 meses. É a régua que o credor usa para medir a geração de caixa da operação.", naoSignifica: "É cálculo GSA com os dados da planilha. Parte dos juros fica no custo dos imóveis, e o release usa uma margem ajustada: o EBITDA do release pode diferir deste." },
  cobertura: { significa: "Quantas vezes o EBITDA cobre as despesas financeiras do período. Abaixo de 1 vez, a operação sozinha não cobriu os juros que passaram pelo resultado.", naoSignifica: "Os juros capitalizados na obra não entram na despesa financeira da DRE, então a conta tende a parecer melhor do que o custo total da dívida." },
  liquidaEbitda: { significa: "Em quantos anos de EBITDA a dívida líquida seria paga. É a medida mais usada por credores corporativos.", naoSignifica: "Numa incorporadora, a dívida inclui o financiamento da obra, quitado com recebíveis, e o EBITDA é irregular entre lançamentos: a razão oscila muito e não deve ser lida sozinha." },
  jurosCaixa: { significa: "Compara o caixa gerado pela operação em 12 meses com os juros efetivamente pagos. Negativo ou abaixo de 1 vez significa que os juros foram pagos com outras fontes: caixa guardado, novas dívidas ou venda de ativos.", naoSignifica: "Em incorporadora o caixa operacional é negativo quando a empresa investe em terrenos e obras novas. Isso é normal num ciclo de crescimento, mas precisa ser financiado." },
  perfil: { significa: "Parcela da dívida que vence em até 12 meses. Quanto maior, mais a companhia depende de renovar ou de ter caixa nos próximos meses.", naoSignifica: "Parte do curto prazo é financiamento à obra, pago na medida em que os clientes pagam." },
  recebiveis: { significa: "Quanto a companhia tem a receber dos clientes para cada real de dívida. É a principal garantia econômica de uma incorporadora.", naoSignifica: "Recebível não é caixa: parte está no longo prazo e depende de repasse dos bancos e de distratos." },
};

/** Cartões da leitura do credor: valor no último trimestre com balanço e no mesmo trimestre do ano anterior. */
export function leituraCredor(ix, an) {
  const q = C.ultimoComDado(C.serieTri(ix, 114)).periodo;
  const k = ix.posTri.get(q);
  const ka = ix.posTri.get(C.mesmoTrimestreAnoAnterior(q));
  const a = medidasCredor(ix, k), b = ka === undefined ? null : medidasCredor(ix, ka);
  const comp = (x, y, un) => C.compararValores(x, y, un);
  const cartao = (chave, titulo, pergunta, formula, valor, base, unidade, termos) => ({
    chave, titulo, pergunta, formula, valor, base, unidade, periodo: q, periodoBase: b ? b.periodo : null, comp: base === null ? null : comp(valor, base, unidade),
    termos, ...textoC[{ bruta: "bruta", liquida: "liquida", ebitda: "ebitda", cobertura: "cobertura", liquidaEbitda: "liquidaEbitda", jurosCaixa: "jurosCaixa", perfil: "perfil", recebiveis: "recebiveis" }[chave]],
  });
  const R = (rotulo, valor, unidade = "BRL_MILHOES") => ({ rotulo, valor, unidade });
  const cartoes = [
    cartao("bruta", "Dívida bruta", "Quanto a companhia deve?", "Empréstimos e financiamentos do curto prazo + do longo prazo", a.bruta, b?.bruta ?? null, "BRL_MILHOES",
      [R("Curto prazo", a.emprestimosCP), R("Longo prazo", a.emprestimosLP)]),
    cartao("liquida", "Dívida líquida sobre o patrimônio líquido", "Quanto sobra de dívida depois do caixa, em relação ao capital próprio?", "(dívida bruta - caixa - títulos e valores mobiliários de curto e longo prazo) ÷ patrimônio líquido × 100", a.alavancagemPct, b?.alavancagemPct ?? null, "%",
      [R("Dívida bruta", a.bruta), R("Caixa e títulos", a.caixaTvm), R("Dívida líquida", a.liquida), R("Patrimônio líquido", a.pl)]),
    cartao("ebitda", "EBITDA aproximado, 12 meses", "A operação gera resultado para pagar a dívida?", "Soma dos últimos 4 trimestres de (lucro operacional + depreciações e amortizações)", a.ebitda, b?.ebitda ?? null, "BRL_MILHOES",
      [R("Lucro operacional, 12 meses", a.ebit), R("Depreciações e amortizações, 12 meses", a.da)]),
    cartao("cobertura", "Cobertura das despesas financeiras", "O EBITDA cobre os juros?", "EBITDA de 12 meses ÷ despesas financeiras de 12 meses", a.coberturaJuros, b?.coberturaJuros ?? null, "x",
      [R("EBITDA, 12 meses", a.ebitda), R("Despesas financeiras, 12 meses", a.despFin)]),
    cartao("liquidaEbitda", "Dívida líquida sobre o EBITDA", "Em quantos anos de EBITDA a dívida líquida se paga?", "Dívida líquida ÷ EBITDA de 12 meses (n/d se o EBITDA for zero ou negativo)", a.liquidaSobreEbitda, b?.liquidaSobreEbitda ?? null, "x",
      [R("Dívida líquida", a.liquida), R("EBITDA, 12 meses", a.ebitda)]),
    cartao("jurosCaixa", "Caixa da operação sobre os juros pagos", "O caixa da operação paga os juros?", "Caixa das atividades operacionais de 12 meses ÷ juros pagos em 12 meses", a.caixaOperacionalSobreJuros, b?.caixaOperacionalSobreJuros ?? null, "x",
      [R("Caixa operacional, 12 meses", a.fco), R("Juros pagos, 12 meses", a.jurosPagos)]),
    cartao("perfil", "Dívida que vence em 12 meses", "Quanto da dívida vence logo?", "Empréstimos do curto prazo ÷ dívida bruta × 100", a.cpPct, b?.cpPct ?? null, "%",
      [R("Curto prazo", a.emprestimosCP), R("Dívida bruta", a.bruta)]),
    cartao("recebiveis", "Recebíveis sobre a dívida bruta", "O que a companhia tem a receber cobre a dívida?", "(contas a receber de clientes, curto + longo prazo) ÷ dívida bruta", div(a.recebiveis, a.bruta), b ? div(b.recebiveis, b.bruta) : null, "x",
      [R("Contas a receber", a.recebiveis), R("Dívida bruta", a.bruta)]),
  ];
  const caps = an?.citacoes_de_release ?? {};
  return { periodo: q, cartoes, medidas: a, anterior: b, citacaoCorporativa: caps.divida_corporativa_sobre_pl_3T26 ?? null };
}

// ------------------------------------------------------------------ comprador de imóvel

/** Custo de oportunidade e ambiente de crédito no fim do último trimestre com dado, vindos das séries públicas. */
export function custoDeOportunidade(ix, ext) {
  const S = ext.series;
  const q = C.ultimoComDado(C.serieTri(ix, 114)).periodo;
  const meses = X.mesesDosTrimestres([q]);
  const fim = meses[2];
  const m12 = X.ultimos12(fim);
  const ant12 = X.ultimos12(X.mesesDosTrimestres([C.mesmoTrimestreAnoAnterior(q)])[2]);
  const cdi = X.acumulado(X.mapaMensal(S.cdi_mensal), m12), cdiAnt = X.acumulado(X.mapaMensal(S.cdi_mensal), ant12);
  const ipca = X.acumulado(X.mapaMensal(S.ipca_mensal), m12);
  const incc = X.acumulado(X.mapaMensal(S.incc_mensal), m12);
  const juros = X.mediaMeses(X.mapaMensal(S.credito_imob_juros), meses);
  const conc = X.somaMeses(X.mapaMensal(S.credito_imob_concessoes), m12), concAnt = X.somaMeses(X.mapaMensal(S.credito_imob_concessoes), ant12);
  const selic = X.selicJanela(S.meta_selic, meses).fim;
  const fii12m = X.acumulado(X.mapaMensal(S.fii_rentabilidade_efetiva), m12);
  const fiiDy = X.somaMeses(X.mapaMensal(S.fii_rendimento_distribuido), m12);
  return {
    fii12m, fiiRendimento12m: fiiDy,
    periodo: q, cdi12m: cdi, cdi12mAnterior: cdiAnt, ipca12m: ipca, incc12m: incc, jurosFinanciamento: juros, selic,
    concessoes12m: conc, concessoesAA: conc === null || concAnt === null || concAnt === 0 ? null : (conc / concAnt - 1) * 100,
    cdiReal: cdi === null || ipca === null ? null : ((1 + cdi / 100) / (1 + ipca / 100) - 1) * 100,
  };
}

/**
 * Conta de retorno de um imóvel comprado para renda, com premissas digitadas pelo usuário (cálculo GSA, não dado publicado).
 * aluguelMensalPct: aluguel mensal bruto, em % do preço. custosPct: vacância, condomínio, IPTU e administração, em % do aluguel.
 * valorizacaoPct: valorização esperada do imóvel em 12 meses. financiadoPct: parte do preço financiada (0 a 90). jurosFinanciamentoPct: juros do financiamento.
 */
export function retornoImovel({ aluguelMensalPct, custosPct, valorizacaoPct, financiadoPct, jurosFinanciamentoPct, cdiPct, ipcaPct }) {
  const aluguelLiquido = aluguelMensalPct * 12 * (1 - custosPct / 100);
  const retornoTotal = aluguelLiquido + valorizacaoPct;
  const f = financiadoPct / 100;
  const retornoCapitalProprio = f >= 1 ? null : (retornoTotal - f * jurosFinanciamentoPct) / (1 - f);
  return {
    aluguelLiquido, retornoTotal,
    spreadSobreCdi: retornoTotal - cdiPct,
    retornoReal: ((1 + retornoTotal / 100) / (1 + ipcaPct / 100) - 1) * 100,
    valorizacaoDeEmpate: cdiPct - aluguelLiquido,
    retornoCapitalProprio,
    spreadCapitalProprioSobreCdi: retornoCapitalProprio === null ? null : retornoCapitalProprio - cdiPct,
    financiamentoAjuda: retornoTotal > jurosFinanciamentoPct,
  };
}

export const PREMISSAS_INICIAIS = { aluguelMensalPct: 0.45, custosPct: 25, valorizacaoPct: 5, financiadoPct: 0 };

/** Sinais de risco de entrega e de solidez da incorporadora, com os mesmos números do restante do site. */
export function sinaisDaObra(ix, an) {
  const p = C.provasSolidez(ix, an);
  const q = p.periodoFin;
  const k = ix.posTri.get(q);
  const adiant = [v(ix, 122, k), v(ix, 131, k)];
  const adiantamentos = adiant.some((x) => x === null) ? null : adiant[0] + adiant[1];
  const emp = [v(ix, 115, k), v(ix, 128, k)];
  const bruta = emp.some((x) => x === null) ? null : emp[0] + emp[1];
  const unid12 = C.somaJanela(ix.ind.get(13).tri, ix.posTri.get(p.periodoOp));
  const unid12Ant = C.somaJanela(ix.ind.get(13).tri, ix.posTri.get(p.periodoOp) - 4);
  const vgv12 = C.somaJanela(ix.ind.get(9).tri, ix.posTri.get(p.periodoOp));
  const solidez = C.indiceSolidez(ix);
  return {
    periodoOp: p.periodoOp, periodoFin: q,
    cobertura: p.terreno.cobertura, landbank: p.terreno.landbank.valor, lancamentos12m: p.terreno.lancamentos12m,
    vso: p.venda.vso, unidades12m: unid12, unidades12mAnterior: unid12Ant,
    ticketMedio12m: div(vgv12, unid12) === null ? null : (vgv12 / unid12) * 1000,   // R$ mil por unidade
    adiantamentos, adiantamentosSobreDivida: div(adiantamentos, bruta),
    selos: solidez.map((s) => ({ chave: s.chave, nome: s.nome, selo: s.selo, valor: s.atual ? s.atual.valor : null, unidade: s.unidade })),
  };
}

// ------------------------------------------------------------------ outros investimentos

/**
 * Quanto R$ 100 viram em cada alternativa, nos 12 meses até o último trimestre com balanço e desde o fim do 3T21 (cinco anos).
 * Tudo das séries públicas, bruto de imposto. "ipca" e "igpm" entram como régua da inflação, não como investimento.
 */
export function alternativas(ix, ext) {
  const S = ext.series;
  const q = C.ultimoComDado(C.serieTri(ix, 114)).periodo;
  const fim = X.mesesDosTrimestres([q])[2];
  const m12 = X.ultimos12(fim);
  const baseCinco = X.mesesDosTrimestres([X.BASE_INDICE])[2];     // fim do 3T21
  const desde = [];
  for (let m = baseCinco; m !== fim;) {
    let [a, mm] = m.split("-").map(Number);
    mm += 1;
    if (mm === 13) { mm = 1; a += 1; }
    m = `${a}-${String(mm).padStart(2, "0")}`;
    desde.push(m);
  }
  const cadeia = (chave) => ({ m12: X.acumulado(X.mapaMensal(S[chave]), m12), cinco: X.acumulado(X.mapaMensal(S[chave]), desde) });
  const dolar = (a, b) => { const x = X.ultimoAte(S.dolar_ptax, a), y = X.ultimoAte(S.dolar_ptax, b); return x === null || y === null ? null : (y / x - 1) * 100; };
  const linhas = [
    { chave: "cdi", rotulo: "CDI (renda fixa)", tipo: "investimento", ...cadeia("cdi_mensal") },
    { chave: "poupanca", rotulo: "Poupança", tipo: "investimento", ...cadeia("poupanca_mensal") },
    { chave: "fii", rotulo: "Fundos imobiliários, média do setor (CVM)", tipo: "investimento", ...cadeia("fii_rentabilidade_efetiva") },
    { chave: "dolar", rotulo: "Dólar comercial", tipo: "investimento", m12: dolar(X.mesAnterior(m12[0]), fim), cinco: dolar(baseCinco, fim) },
    { chave: "ipca", rotulo: "IPCA (inflação)", tipo: "regua", ...cadeia("ipca_mensal") },
    { chave: "igpm", rotulo: "IGP-M (reajuste de aluguel)", tipo: "regua", ...cadeia("igpm_mensal") },
    { chave: "incc", rotulo: "INCC-M (custo da obra)", tipo: "regua", ...cadeia("incc_mensal") },
  ];
  return { periodo: q, fim, linhas };
}
