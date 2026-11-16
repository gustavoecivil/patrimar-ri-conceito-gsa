// Funções puras de cálculo do site. Sem DOM, sem rede, sem relógio: entrada igual, saída igual.
// Rodam no navegador (módulo ES) e no Node (testes e auditoria). Nenhum número é escrito à mão aqui.
//
// Convenções:
// - "ix" é o índice criado por indexar(data_site).
// - Ausência de dado é null, nunca zero. Qualquer conta com entrada null devolve null.
// - Saldo (landbank, caixa, balanço) nunca é somado entre trimestres: só fluxo entra em janelas de 12 meses.

// ---------------------------------------------------------------- índice e acesso

export function indexar(ds) {
  const tri = ds.periodos.trimestres;
  const anos = ds.periodos.anos;
  return {
    ds,
    tri,
    anos,
    posTri: new Map(tri.map((p, i) => [p, i])),
    posAno: new Map(anos.map((p, i) => [p, i])),
    ind: new Map(ds.indicadores.map((i) => [i.id, i])),
  };
}

export function valor(ix, id, periodo) {
  const i = ix.ind.get(id);
  if (!i) return null;
  if (ix.posTri.has(periodo)) return i.tri[ix.posTri.get(periodo)] ?? null;
  if (ix.posAno.has(periodo)) return i.ano[ix.posAno.get(periodo)] ?? null;
  return null;
}

/** Série trimestral de um indicador: [{periodo, valor|null}] na ordem cronológica. */
export function serieTri(ix, id) {
  const i = ix.ind.get(id);
  return ix.tri.map((periodo, k) => ({ periodo, valor: i?.tri[k] ?? null }));
}

export function serieAno(ix, id) {
  const i = ix.ind.get(id);
  return ix.anos.map((periodo, k) => ({ periodo, valor: i?.ano[k] ?? null }));
}

export function ultimoComDado(serie) {
  for (let k = serie.length - 1; k >= 0; k--) if (serie[k].valor !== null) return serie[k];
  return null;
}

// ---------------------------------------------------------------- períodos

/** "3T26" -> "3T25". Só trimestres. */
export function mesmoTrimestreAnoAnterior(p) {
  const m = /^([1-4])T(\d{2})$/.exec(p);
  if (!m) return null;
  return `${m[1]}T${String((Number(m[2]) + 99) % 100).padStart(2, "0")}`;
}

/** "1T26" -> "4T25". */
export function trimestreAnterior(p) {
  const m = /^([1-4])T(\d{2})$/.exec(p);
  if (!m) return null;
  const t = Number(m[1]);
  if (t > 1) return `${t - 1}T${m[2]}`;
  return `4T${String((Number(m[2]) + 99) % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- variações

/** Variação percentual. Base zero ou ausente devolve null. Base negativa usa o módulo da base. */
export function variacaoPct(atual, base) {
  if (atual === null || base === null || atual === undefined || base === undefined) return null;
  if (base === 0) return null;
  return ((atual - base) / Math.abs(base)) * 100;
}

export function variacaoAA(ix, id, periodo) {
  const base = mesmoTrimestreAnoAnterior(periodo);
  if (!base) return null;
  return variacaoPct(valor(ix, id, periodo), valor(ix, id, base));
}

/** Diferença em pontos percentuais contra o mesmo trimestre do ano anterior (para razões em %). */
export function variacaoPP(ix, id, periodo) {
  const base = mesmoTrimestreAnoAnterior(periodo);
  const a = valor(ix, id, periodo);
  const b = base ? valor(ix, id, base) : null;
  return a === null || b === null ? null : a - b;
}

export function variacaoTT(ix, id, periodo) {
  const base = trimestreAnterior(periodo);
  if (!base) return null;
  return variacaoPct(valor(ix, id, periodo), valor(ix, id, base));
}

// ---------------------------------------------------------------- janelas de 12 meses

/** Soma dos 4 trimestres que terminam em k. Se faltar qualquer um, null (ausência não é zero). */
export function somaJanela(valores, k, n = 4) {
  if (k < n - 1) return null;
  let s = 0;
  for (let j = k - n + 1; j <= k; j++) {
    if (valores[j] === null || valores[j] === undefined) return null;
    s += valores[j];
  }
  return s;
}

/** Série de 12 meses móveis (LTM) de um indicador de FLUXO. Estoque é recusado. */
export function serieLTM(ix, id) {
  const i = ix.ind.get(id);
  if (!i) return [];
  if (i.tipo !== "fluxo") throw new Error(`Indicador ${id} é ${i.tipo}: não se soma saldo entre trimestres`);
  return ix.tri.map((periodo, k) => ({ periodo, valor: somaJanela(i.tri, k) }));
}

// ---------------------------------------------------------------- recordes

function maximos(serie) {
  const com = serie.filter((x) => x.valor !== null);
  if (!com.length) return null;
  const mx = Math.max(...com.map((x) => x.valor));
  return { valor: mx, donos: com.filter((x) => x.valor === mx).map((x) => x.periodo), de: com[0].periodo, ate: com[com.length - 1].periodo, n: com.length };
}

function minimos(serie) {
  const com = serie.filter((x) => x.valor !== null);
  if (!com.length) return null;
  const mn = Math.min(...com.map((x) => x.valor));
  return { valor: mn, donos: com.filter((x) => x.valor === mn).map((x) => x.periodo), de: com[0].periodo, ate: com[com.length - 1].periodo, n: com.length };
}

/** Máximo da série. "periodo" só vem preenchido se o máximo for único (empate não é recorde). */
export function recorde(serie) {
  const m = maximos(serie);
  if (!m) return null;
  return { periodo: m.donos.length === 1 ? m.donos[0] : null, valor: m.valor, empate: m.donos.length > 1, de: m.de, ate: m.ate, n: m.n };
}

export function minimo(serie) {
  const m = minimos(serie);
  if (!m) return null;
  return { periodo: m.donos.length === 1 ? m.donos[0] : null, valor: m.valor, empate: m.donos.length > 1, de: m.de, ate: m.ate, n: m.n };
}

/** O site só anuncia "recorde" se esta função confirmar na própria base. */
export function confirmaRecorde(serie, periodo) {
  const r = recorde(serie);
  return r !== null && r.periodo === periodo;
}

export function confirmaMinimo(serie, periodo) {
  const r = minimo(serie);
  return r !== null && r.periodo === periodo;
}

/** Máximo de uma série ANUAL ou trimestral a partir do índice. */
export function recordeDe(ix, id, tipo = "tri") {
  return recorde(tipo === "ano" ? serieAno(ix, id) : serieTri(ix, id));
}

// ---------------------------------------------------------------- estatística

export function media(v) {
  const x = v.filter((n) => n !== null && n !== undefined);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
}

/** Desvio-padrão amostral (n - 1). */
export function desvio(v) {
  const x = v.filter((n) => n !== null && n !== undefined);
  if (x.length < 2) return null;
  const m = media(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1));
}

export function mediana(v) {
  const x = v.filter((n) => n !== null && n !== undefined).sort((a, b) => a - b);
  if (!x.length) return null;
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
}

/** z-score contra um histórico. Sem dispersão ou com menos de 2 pontos, null. */
export function zscore(v, historico) {
  if (v === null || v === undefined) return null;
  const s = desvio(historico);
  if (s === null || s === 0) return null;
  return (v - media(historico)) / s;
}

/** Percentil de posição (0 a 100): fatia do histórico abaixo de v, com empate contando metade. */
export function percentil(v, historico) {
  if (v === null || v === undefined) return null;
  const h = historico.filter((n) => n !== null && n !== undefined);
  if (!h.length) return null;
  const abaixo = h.filter((n) => n < v).length;
  const iguais = h.filter((n) => n === v).length;
  return ((abaixo + iguais / 2) / h.length) * 100;
}

// ---------------------------------------------------------------- sazonalidade

/** Média por trimestre do ano (1 a 4) de um indicador de FLUXO, só com dados presentes. */
export function sazonalidade(ix, id) {
  const i = ix.ind.get(id);
  if (!i || i.tipo !== "fluxo") throw new Error(`Sazonalidade só para fluxo (indicador ${id})`);
  const acc = { 1: [], 2: [], 3: [], 4: [] };
  ix.tri.forEach((p, k) => {
    if (i.tri[k] !== null) acc[Number(p[0])].push(i.tri[k]);
  });
  const out = {};
  for (const t of [1, 2, 3, 4]) out[t] = { media: media(acc[t]), n: acc[t].length };
  const total = [1, 2, 3, 4].reduce((a, t) => a + (out[t].media ?? 0), 0);
  for (const t of [1, 2, 3, 4]) out[t].parte = total ? (out[t].media / total) * 100 : null;
  return out;
}

// ---------------------------------------------------------------- Índice de Solidez GSA

// Cada indicador tem fórmula aberta, entradas explícitas e sentido (o que é melhor). Todos calculados
// trimestre a trimestre a partir da planilha. "Giro de vendas sobre estoque" NÃO entra: a planilha não
// traz estoque em VGV (só os releases, em gráfico).
const ID = { LANC: 1, LAND: 21, CAIXA_OP: 73, CAIXA: 93, TVM: 94, REC_CP: 95, REC_LP: 102, EMP_CP: 115, EMP_LP: 128, PL: 146 };

function v(ix, id, k) {
  return ix.ind.get(id)?.tri[k] ?? null;
}
function divide(a, b) {
  return a === null || b === null || b === 0 ? null : a / b;
}

export const DEFINICOES_SOLIDEZ = [
  {
    chave: "cobertura_landbank",
    nome: "Cobertura do landbank",
    unidade: "anos",
    sentido: "maior_melhor",
    formula: "Landbank (VGV) ÷ lançamentos dos últimos 12 meses",
    entradas: [ID.LAND, ID.LANC],
    calc: (ix, k) => divide(v(ix, ID.LAND, k), somaJanela(ix.ind.get(ID.LANC).tri, k)),
  },
  {
    chave: "liquidez_curto_prazo",
    nome: "Liquidez de curto prazo",
    unidade: "x",
    sentido: "maior_melhor",
    formula: "Caixa e equivalentes ÷ empréstimos e financiamentos do circulante",
    entradas: [ID.CAIXA, ID.EMP_CP],
    calc: (ix, k) => divide(v(ix, ID.CAIXA, k), v(ix, ID.EMP_CP, k)),
  },
  {
    chave: "cobertura_divida_recebiveis",
    nome: "Cobertura da dívida pelos recebíveis",
    unidade: "x",
    sentido: "maior_melhor",
    formula: "(Contas a receber de curto + longo prazo) ÷ (empréstimos do circulante + do não circulante)",
    entradas: [ID.REC_CP, ID.REC_LP, ID.EMP_CP, ID.EMP_LP],
    calc: (ix, k) => {
      const rec = v(ix, ID.REC_CP, k) === null || v(ix, ID.REC_LP, k) === null ? null : v(ix, ID.REC_CP, k) + v(ix, ID.REC_LP, k);
      const div = v(ix, ID.EMP_CP, k) === null || v(ix, ID.EMP_LP, k) === null ? null : v(ix, ID.EMP_CP, k) + v(ix, ID.EMP_LP, k);
      return divide(rec, div);
    },
  },
  {
    chave: "alavancagem",
    nome: "Alavancagem (dívida líquida sobre patrimônio líquido)",
    unidade: "%",
    sentido: "menor_melhor",
    formula: "(Empréstimos de curto + longo prazo − caixa − títulos e valores mobiliários) ÷ patrimônio líquido × 100. Inclui o financiamento à construção.",
    entradas: [ID.EMP_CP, ID.EMP_LP, ID.CAIXA, ID.TVM, ID.PL],
    calc: (ix, k) => {
      const e = [ID.EMP_CP, ID.EMP_LP, ID.CAIXA, ID.TVM].map((id) => v(ix, id, k));
      if (e.some((x) => x === null)) return null;
      const r = divide(e[0] + e[1] - e[2] - e[3], v(ix, ID.PL, k));
      return r === null ? null : r * 100;
    },
  },
  {
    chave: "caixa_operacional_12m",
    nome: "Caixa operacional dos últimos 12 meses",
    unidade: "BRL_MILHOES",
    sentido: "maior_melhor",
    formula: "Soma dos últimos 4 trimestres do caixa líquido das atividades operacionais",
    entradas: [ID.CAIXA_OP],
    calc: (ix, k) => somaJanela(ix.ind.get(ID.CAIXA_OP).tri, k),
  },
];

/** Mínimo de trimestres anteriores para falar de "histórico próprio". */
export const MIN_HISTORICO = 8;
/** Abaixo deste percentil da própria série (já ajustado pelo sentido) o selo vira "atenção". */
export const CORTE_ATENCAO = 25;

/** Entradas da conta de cada indicador do Índice no trimestre de índice k: a aritmética que a tela mostra. */
export function termosSolidez(ix, chave, k) {
  const R = (rotulo, valor_, unidade = "BRL_MILHOES") => ({ rotulo, valor: valor_, unidade });
  const soma2 = (a, b) => (a === null || b === null ? null : a + b);
  switch (chave) {
    case "cobertura_landbank":
      return [R("Landbank (VGV)", v(ix, ID.LAND, k)), R("Lançamentos dos últimos 12 meses", somaJanela(ix.ind.get(ID.LANC).tri, k))];
    case "liquidez_curto_prazo":
      return [R("Caixa e equivalentes", v(ix, ID.CAIXA, k)), R("Empréstimos do circulante", v(ix, ID.EMP_CP, k))];
    case "cobertura_divida_recebiveis":
      return [R("Contas a receber (curto + longo prazo)", soma2(v(ix, ID.REC_CP, k), v(ix, ID.REC_LP, k))), R("Empréstimos (circulante + não circulante)", soma2(v(ix, ID.EMP_CP, k), v(ix, ID.EMP_LP, k)))];
    case "alavancagem":
      return [R("Empréstimos (circulante + não circulante)", soma2(v(ix, ID.EMP_CP, k), v(ix, ID.EMP_LP, k))), R("Caixa e títulos e valores mobiliários", soma2(v(ix, ID.CAIXA, k), v(ix, ID.TVM, k))), R("Patrimônio líquido", v(ix, ID.PL, k))];
    case "caixa_operacional_12m":
      return [0, 1, 2, 3].map((j) => R(`Caixa operacional, ${ix.tri[k - 3 + j]}`, v(ix, ID.CAIXA_OP, k - 3 + j)));
    default:
      return [];
  }
}

/** Avalia um indicador do Índice: série, posição atual contra o histórico anterior e selo. */
export function avaliarSolidez(ix, def) {
  const serie = ix.tri.map((periodo, k) => ({ periodo, valor: def.calc(ix, k) }));
  const atual = ultimoComDado(serie);
  const base = { chave: def.chave, nome: def.nome, unidade: def.unidade, sentido: def.sentido, formula: def.formula, entradas: def.entradas, serie, corte: CORTE_ATENCAO };
  if (!atual) return { ...base, atual: null, selo: "sem_historico" };
  const hist = serie.filter((x) => x.periodo !== atual.periodo && x.valor !== null && ix.posTri.get(x.periodo) < ix.posTri.get(atual.periodo)).map((x) => x.valor);
  const pct = percentil(atual.valor, hist);
  const qualidade = pct === null ? null : def.sentido === "maior_melhor" ? pct : 100 - pct;
  const selo = hist.length < MIN_HISTORICO || qualidade === null ? "sem_historico" : qualidade < CORTE_ATENCAO ? "atencao" : "confortavel";
  return {
    ...base,
    atual,
    termos: termosSolidez(ix, def.chave, ix.posTri.get(atual.periodo)),
    historico: { n: hist.length, media: media(hist), mediana: mediana(hist), desvio: desvio(hist), de: serie.find((x) => x.valor !== null).periodo },
    zscore: zscore(atual.valor, hist),
    percentil: pct,
    qualidade,
    selo,
  };
}

export function indiceSolidez(ix) {
  return DEFINICOES_SOLIDEZ.map((d) => avaliarSolidez(ix, d));
}

/**
 * Índice composto OPCIONAL: média ponderada da qualidade (percentil ajustado pelo sentido) dos indicadores.
 * Os pesos são sempre explícitos. Indicador sem histórico fica de fora e os pesos restantes são renormalizados.
 */
export function solidezComposto(avaliacoes, pesos) {
  let soma = 0;
  let total = 0;
  const usados = [];
  for (const a of avaliacoes) {
    const w = pesos[a.chave];
    if (!w || a.qualidade === null || a.qualidade === undefined) continue;
    soma += w * a.qualidade;
    total += w;
    usados.push({ chave: a.chave, peso: w, qualidade: a.qualidade });
  }
  return total ? { nota: soma / total, usados, pesoTotal: total } : null;
}

// ---------------------------------------------------------------- pontos de atenção

/**
 * Pontos de atenção gerados por regra (nada escrito à mão). Para cada indicador-chave, nos últimos
 * "janela" trimestres com dado, entra na lista quando:
 *   (a) piorou mais que regras.piora_aa_pct contra o mesmo trimestre do ano anterior;
 *   (b) está abaixo do percentil regras.percentil da própria série (ajustado pelo sentido);
 *   (c) é negativo e o indicador tem negativo_e_alerta.
 * Mais as comparações anuais cadastradas (ex.: lucro de 2025 contra 2023).
 * Contexto e contrapeso vêm de "anotacoes" (web/anotacoes.json, pontos_de_atencao), nunca dos números.
 */
/** Quantos trimestres com dado, por indicador-chave, a regra examina. */
export const JANELA_PONTOS = 4;

export function pontosDeAtencao(ix, regras, anotacoes = {}, janela = JANELA_PONTOS) {
  const linhas = [];
  const anota = (id, periodo) => {
    const lista = anotacoes[String(id)] ?? [];
    return lista.find((a) => a.periodo === periodo) ?? lista.find((a) => !a.periodo) ?? null;
  };
  const piora = (sentido, var_) => (var_ === null ? null : sentido === "maior_melhor" ? -var_ : var_);

  for (const chave of regras.indicadores_chave) {
    const i = ix.ind.get(chave.id);
    if (!i) continue;
    const serie = serieTri(ix, chave.id);
    const comDado = serie.map((x, k) => ({ ...x, k })).filter((x) => x.valor !== null);
    for (const x of comDado.slice(-janela)) {
      const motivos = [];
      const base = mesmoTrimestreAnoAnterior(x.periodo);
      const valorBase = base ? valor(ix, chave.id, base) : null;
      const var_ = variacaoPct(x.valor, valorBase);
      const p = piora(chave.sentido, var_);
      if (p !== null && p > regras.piora_aa_pct) motivos.push({ regra: "piora_aa", pioraPct: p, contra: base, detalhe: `piorou ${p.toFixed(1)}% contra ${base}` });
      const hist = comDado.filter((y) => y.periodo !== x.periodo).map((y) => y.valor);
      const pct = percentil(x.valor, hist);
      const qual = pct === null ? null : chave.sentido === "maior_melhor" ? pct : 100 - pct;
      if (qual !== null && qual < regras.percentil) motivos.push({ regra: "percentil", posicao: qual, corte: regras.percentil, detalhe: `abaixo do percentil ${regras.percentil} da própria série (posição ${qual.toFixed(0)})` });
      if (chave.negativo_e_alerta && x.valor < 0) motivos.push({ regra: "negativo", detalhe: "valor negativo" });
      if (!motivos.length) continue;
      const nota = anota(chave.id, x.periodo);
      linhas.push({
        id: chave.id, rotulo: i.rotulo, periodo: x.periodo, valor: x.valor, unidade: i.unidade,
        comparacao: base ? { periodo: base, valor: valorBase, variacaoPct: var_ } : null,
        percentil: pct, motivos, ...contextoDe(nota),
      });
    }
  }

  for (const c of regras.comparacoes_anuais ?? []) {
    const atual = valor(ix, c.id, c.periodo);
    const base = valor(ix, c.id, c.contra);
    const var_ = variacaoPct(atual, base);
    const p = piora(c.sentido, var_);
    if (p === null || p <= regras.piora_aa_pct) continue;
    const nota = anota(c.id, c.periodo);
    linhas.push({
      id: c.id, rotulo: ix.ind.get(c.id).rotulo, periodo: c.periodo, valor: atual, unidade: ix.ind.get(c.id).unidade,
      comparacao: { periodo: c.contra, valor: base, variacaoPct: var_ },
      percentil: null, motivos: [{ regra: "piora_anual", pioraPct: p, contra: c.contra, detalhe: `piorou ${p.toFixed(1)}% contra ${c.contra}` }], ...contextoDe(nota),
    });
  }

  return linhas.sort((a, b) => ordemPeriodo(b.periodo) - ordemPeriodo(a.periodo) || a.id - b.id);
}

function contextoDe(nota) {
  return nota
    ? { contexto: nota.contexto, contrapeso: nota.contrapeso, fonte: nota.fonte, pagina: nota.pagina ?? null, semContexto: false }
    : { contexto: null, contrapeso: null, fonte: null, pagina: null, semContexto: true };
}

/** Chave de ordenação: "2T26" -> 20262; "2025" -> 20255 (anual depois dos trimestres do mesmo ano). */
export function ordemPeriodo(p) {
  const m = /^([1-4])T(\d{2})$/.exec(p);
  if (m) return (2000 + Number(m[2])) * 10 + Number(m[1]);
  return Number(p) * 10 + 5;
}

// ---------------------------------------------------------------- simulador de cobertura

/** Anos de lançamento que um landbank sustenta em um ritmo anual. Cálculo GSA: VGV potencial não é receita. */
export function coberturaAnos(landbank, ritmoAnual) {
  return landbank === null || !ritmoAnual || ritmoAnual <= 0 ? null : landbank / ritmoAnual;
}

// ---------------------------------------------------------------- painel da abertura e fonte de cada número

/** Endereço da célula na planilha oficial (ex.: "AH29"): coluna do período + linha do indicador. */
export function enderecoCelula(ix, id, periodo) {
  const i = ix.ind.get(id);
  const col = ix.ds.periodos.coluna[periodo];
  return i && col && i.linha ? `${col}${i.linha}` : null;
}

// Indicadores do painel "Panorama". "recorde" liga o selo de recorde, que só aparece se confirmado na base.
export const PANORAMA = [
  { id: 1, recorde: true },
  { id: 9, recorde: true },
  { id: 21, recorde: true },
  { id: 25, recorde: true },
  { id: 40, recorde: false },
  { id: 93, recorde: false },
];

/** Cartões do panorama: último trimestre COM dado de cada indicador (nunca n/d disfarçado de zero). */
export function kpisPanorama(ix) {
  return PANORAMA.map((cfg) => {
    const i = ix.ind.get(cfg.id);
    const serie = serieTri(ix, cfg.id);
    const atual = ultimoComDado(serie);
    const base = atual ? mesmoTrimestreAnoAnterior(atual.periodo) : null;
    const valorBase = base ? valor(ix, cfg.id, base) : null;
    const rec = recorde(serie);
    return {
      id: cfg.id,
      rotulo: i.rotulo,
      unidade: i.unidade,
      tipo: i.tipo,
      periodo: atual.periodo,
      valor: atual.valor,
      comparacao: { periodo: base, valor: valorBase },
      // Variação percentual só tem sentido com os dois valores positivos.
      variacaoPct: atual.valor > 0 && valorBase > 0 ? variacaoPct(atual.valor, valorBase) : null,
      recorde: cfg.recorde && confirmaRecorde(serie, atual.periodo),
      recordeDesde: rec ? rec.de : null,
      celula: enderecoCelula(ix, cfg.id, atual.periodo),
    };
  });
}

// ---------------------------------------------------------------- três provas de solidez (abertura)

function destaqueDe(ix, id, periodo) {
  const serie = serieTri(ix, id);
  const rec = recorde(serie);
  const base = mesmoTrimestreAnoAnterior(periodo);
  const v = valor(ix, id, periodo);
  const b = base ? valor(ix, id, base) : null;
  return {
    id, periodo, valor: v, celula: enderecoCelula(ix, id, periodo),
    comparacao: { periodo: base, valor: b },
    variacaoPct: v > 0 && b > 0 ? variacaoPct(v, b) : null,
    recorde: confirmaRecorde(serie, periodo),
    recordeDesde: rec ? rec.de : null,
    maximo: rec ? { periodo: rec.periodo, valor: rec.valor } : null,
  };
}

/** Lançamentos dos 4 trimestres que terminam em "periodo" (fluxo). null se faltar algum. */
export function lancamentos12m(ix, periodo) {
  const k = ix.posTri.get(periodo);
  return k === undefined ? null : somaJanela(ix.ind.get(1).tri, k);
}

/**
 * As três provas: terreno (landbank), venda (unidades e VSO) e balanço (ativo, PL, contas a receber).
 * O recorde só vem marcado se confirmado na base. A VSO não existe na planilha: vem de uma citação de
 * release cadastrada em anotacoes.json, com documento e página. "periodoOp" e "periodoFin" são o último
 * trimestre com dado operacional e financeiro.
 */
export function provasSolidez(ix, an, { anoInicial = "2023" } = {}) {
  const periodoOp = ultimoComDado(serieTri(ix, 21)).periodo;
  const periodoFin = ultimoComDado(serieTri(ix, 114)).periodo;
  const ltm = lancamentos12m(ix, periodoOp);
  const terreno = {
    landbank: destaqueDe(ix, 21, periodoOp),
    lancamentos12m: ltm,
    cobertura: coberturaAnos(valor(ix, 21, periodoOp), ltm),
    janela: { de: ix.tri[ix.posTri.get(periodoOp) - 3], ate: periodoOp },
  };
  const venda = {
    unidades: destaqueDe(ix, 13, periodoOp),
    vgv: destaqueDe(ix, 9, periodoOp),
    vso: an?.citacoes_de_release?.vso_12_meses_3T26 ?? null,
  };
  const ativo = destaqueDe(ix, 114, periodoFin);
  const balanco = {
    ativo: { inicial: { periodo: anoInicial, valor: valor(ix, 114, anoInicial), celula: enderecoCelula(ix, 114, anoInicial) }, atual: ativo },
    patrimonio: destaqueDe(ix, 146, periodoFin),
    emprestimosCP: destaqueDe(ix, 115, periodoFin),
    receber: {
      id: 95,
      serie: [anoInicial, "2024", "2025", periodoFin].map((p) => ({ periodo: p, valor: valor(ix, 95, p), celula: enderecoCelula(ix, 95, p) })),
    },
  };
  return { periodoOp, periodoFin, terreno, venda, balanco };
}

// ---------------------------------------------------------------- simulador de cobertura do landbank

/** Dados de partida do simulador: landbank atual, ritmo real dos últimos 12 meses e referências anuais. */
export function simuladorCobertura(ix) {
  const periodo = ultimoComDado(serieTri(ix, 21)).periodo;
  const landbank = valor(ix, 21, periodo);
  const ltm = lancamentos12m(ix, periodo);
  const referencias = [{ chave: "ltm", rotulo: `Últimos 12 meses (até ${periodo})`, milhoes: ltm }];
  for (const ano of ["2024", "2025"]) referencias.push({ chave: ano, rotulo: `Lançado em ${ano}`, milhoes: valor(ix, 1, ano) });
  return { periodo, landbank, celula: enderecoCelula(ix, 21, periodo), ltm, referencias };
}

/** Preenchimento (0 a 1) de cada um dos n anos de uma barra de cobertura. */
export function blocosCobertura(anos, n = 12) {
  return Array.from({ length: n }, (_, i) => Math.max(0, Math.min(1, anos - i)));
}

// ---------------------------------------------------------------- explorador de séries

export const GRANULARIDADES = ["tri", "ltm", "ano"];

/**
 * Compara dois valores de forma honesta: razões em % comparam em pontos percentuais; os demais em percentual
 * só quando os dois lados são positivos; com sinal misto, devolve a diferença absoluta. Falta de dado devolve null.
 */
export function compararValores(atual, base, unidade) {
  if (atual === null || atual === undefined || base === null || base === undefined) return null;
  if (unidade === "PERCENTUAL") return { tipo: "pp", valor: atual - base };
  if (atual > 0 && base > 0) return { tipo: "pct", valor: ((atual - base) / base) * 100 };
  return { tipo: "abs", valor: atual - base };
}

/**
 * Série pronta para o gráfico, em uma granularidade:
 *  - "tri": trimestral, como publicado;
 *  - "ltm": 12 meses móveis, SÓ para fluxo (saldo e razão não se somam), com null onde faltar um trimestre;
 *  - "ano": anual, como publicado (o que é saldo é o saldo de fim de ano).
 * Se a granularidade não vale para o indicador, devolve {erro}. Ausência é null, nunca zero.
 */
export function serieExplorador(ix, id, granularidade = "tri") {
  const i = ix.ind.get(id);
  if (!i) return { id, erro: "Indicador inexistente." };
  const base = { id, rotulo: i.rotulo, unidade: i.unidade, tipo: i.tipo, granularidade, linha: i.linha };
  if (granularidade === "ano") return { ...base, periodos: ix.anos, valores: ix.anos.map((_, k) => i.ano[k] ?? null), lagAA: 1, lagTT: null };
  if (granularidade === "ltm") {
    if (i.tipo !== "fluxo") {
      const natureza = i.tipo === "estoque" ? "um saldo" : "uma razão";
      return { ...base, erro: `Os 12 meses móveis só valem para fluxo. "${i.rotulo}" é ${natureza}: use o trimestral ou o anual.` };
    }
    return { ...base, periodos: ix.tri, valores: ix.tri.map((_, k) => somaJanela(i.tri, k)), lagAA: 4, lagTT: 1 };
  }
  return { ...base, periodos: ix.tri, valores: ix.tri.map((_, k) => i.tri[k] ?? null), lagAA: 4, lagTT: 1 };
}

/** Pontos {periodo, valor} de uma série do explorador (para recorde, mínimo e média). */
export function pontosDaSerie(s) {
  return s.periodos.map((periodo, k) => ({ periodo, valor: s.valores[k] }));
}

/** Recorde e mínimo da série EXIBIDA. Empate não é recorde nem mínimo (periodo fica null). */
export function marcasSerie(s) {
  return { recorde: recorde(pontosDaSerie(s)), minimo: minimo(pontosDaSerie(s)) };
}

/** Último ponto com dado, e as variações contra o mesmo período do ano anterior e contra o período anterior. */
export function leituraSerie(s) {
  const pts = pontosDaSerie(s);
  const ult = ultimoComDado(pts);
  if (!ult) return null;
  const k = s.periodos.indexOf(ult.periodo);
  const baseAA = k - s.lagAA >= 0 ? { periodo: s.periodos[k - s.lagAA], valor: s.valores[k - s.lagAA] } : null;
  const baseTT = s.lagTT && k - s.lagTT >= 0 ? { periodo: s.periodos[k - s.lagTT], valor: s.valores[k - s.lagTT] } : null;
  const m = marcasSerie(s);
  return {
    periodo: ult.periodo,
    valor: ult.valor,
    k,
    aa: baseAA ? { ...baseAA, comp: compararValores(ult.valor, baseAA.valor, s.unidade) } : null,
    tt: baseTT ? { ...baseTT, comp: compararValores(ult.valor, baseTT.valor, s.unidade) } : null,
    recorde: m.recorde,
    minimo: m.minimo,
    eRecorde: m.recorde !== null && m.recorde.periodo === ult.periodo,
    eMinimo: m.minimo !== null && m.minimo.periodo === ult.periodo,
  };
}

/**
 * Eventos para o eixo do tempo: só entram os que caem em um período exibido. No anual, um evento trimestral
 * vira o ano correspondente (ex.: 4T25 vira 2025). Devolve [{...evento, periodoEixo, indice}].
 */
export function eventosNoEixo(eventos, periodos, granularidade) {
  const saida = [];
  for (const e of eventos) {
    const p = granularidade === "ano" ? `20${e.periodo.slice(2)}` : e.periodo;
    const indice = periodos.indexOf(p);
    if (indice >= 0) saida.push({ ...e, periodoEixo: p, indice });
  }
  return saida;
}
