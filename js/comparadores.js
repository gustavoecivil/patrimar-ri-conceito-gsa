// Comparadores: a Patrimar ao lado de referências públicas (Selic, IPCA, INCC-M, crédito imobiliário do Banco Central, PIB da construção do IBGE).
// Funções PURAS, sem DOM. Ausência de dado é null e nunca vira zero: janela com algum mês ou trimestre sem dado dá null.
// Comparar não é provar causa: as correlações trazem sempre o tamanho da amostra.
import * as C from "./calculos.js";
import * as P from "./painel.js";

const TRI_MESES = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12] };
const aaaa = (q) => 2000 + Number(q.slice(2));

/** Meses (aaaa-mm) de uma lista de trimestres ("1T26", ...). */
export function mesesDosTrimestres(tris) {
  const m = [];
  for (const q of tris) for (const mes of TRI_MESES[Number(q[0])]) m.push(`${aaaa(q)}-${String(mes).padStart(2, "0")}`);
  return m;
}

/** Índice mensal: { "2026-03": valor }. A série do BCB traz o dia 1 de cada mês. */
export function mapaMensal(serie) {
  const m = new Map();
  for (const [d, v] of serie.pontos) m.set(d.slice(0, 7), v);
  return m;
}

/** Variação acumulada (%) em composição, nos meses dados; null se faltar algum mês. */
export function acumulado(mapa, meses) {
  let f = 1;
  for (const mes of meses) {
    const v = mapa.get(mes);
    if (v === undefined) return null;
    f *= 1 + v / 100;
  }
  return (f - 1) * 100;
}

export function somaMeses(mapa, meses) {
  let s = 0;
  for (const mes of meses) {
    const v = mapa.get(mes);
    if (v === undefined) return null;
    s += v;
  }
  return s;
}

export function mediaMeses(mapa, meses) {
  const s = somaMeses(mapa, meses);
  return s === null ? null : s / meses.length;
}

/** 12 meses terminando em "aaaa-mm". */
export function ultimos12(fim) {
  let [a, m] = fim.split("-").map(Number);
  const lista = [];
  for (let i = 0; i < 12; i++) {
    lista.unshift(`${a}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) { m = 12; a -= 1; }
  }
  return lista;
}

/** Selic meta no último dia com dado até o fim do último mês da janela, e a média simples dos dias com dado dentro da janela. */
export function selicJanela(diaria, meses) {
  const ini = `${meses[0]}-01`;
  const [a, m] = meses[meses.length - 1].split("-").map(Number);
  const fim = `${meses[meses.length - 1]}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const dentro = diaria.pontos.filter(([d]) => d >= ini && d <= fim);
  if (!dentro.length || dentro[0][0] > `${meses[0]}-07`) return { fim: null, media: null };
  const ate = diaria.pontos.filter(([d]) => d <= fim);
  if (ate[ate.length - 1][0] < `${meses[meses.length - 1]}-20`) return { fim: null, media: null };
  return { fim: ate[ate.length - 1][1], media: dentro.reduce((s, [, v]) => s + v, 0) / dentro.length };
}

/** PIB da construção (índice de volume): média dos trimestres da janela; null se faltar algum. */
export function pibJanela(ext, tris) {
  const mapa = new Map(ext.series.pib_construcao_indice.pontos.map(([k, v]) => [k, v]));
  const vals = tris.map((q) => mapa.get(`${aaaa(q)}-T${q[0]}`));
  return vals.some((v) => v === undefined) ? null : vals.reduce((s, v) => s + v, 0) / vals.length;
}

const tAnterior = (q) => `${q[0]}T${String(Number(q.slice(2)) - 1).padStart(2, "0")}`;

/** Referências externas de uma lista de trimestres, e as do mesmo período um ano antes. */
export function externosDaJanela(ext, tris) {
  const S = ext.series;
  const meses = mesesDosTrimestres(tris);
  const f = (ms) => ({
    ipca: acumulado(mapaMensal(S.ipca_mensal), ms),
    incc: acumulado(mapaMensal(S.incc_mensal), ms),
    concessoes: somaMeses(mapaMensal(S.credito_imob_concessoes), ms),
    juros: mediaMeses(mapaMensal(S.credito_imob_juros), ms),
    selic: selicJanela(S.meta_selic, ms),
  });
  const atual = f(meses);
  const triAnt = tris.map(tAnterior);
  const antes = f(mesesDosTrimestres(triAnt));
  const pib = pibJanela(ext, tris), pibAnt = pibJanela(ext, triAnt);
  const pct = (a, b) => (a === null || b === null || b === 0 ? null : (a / b - 1) * 100);
  return { ...atual, concessoesAA: pct(atual.concessoes, antes.concessoes), pib, pibAA: pct(pib, pibAnt), selicAnterior: antes.selic };
}

/** Uma linha do quadro "o período em comparação": Patrimar (valores publicados) e referências. */
export function quadroJanela(ix, ext, j) {
  const ant = P.janelaAnterior(ix, j);
  const pat = (id) => {
    const v = P.agregar(ix, id, j), b = ant ? P.agregar(ix, id, ant) : null;
    return { valor: v, base: b, aa: v !== null && b !== null && b > 0 ? (v / b - 1) * 100 : null };
  };
  const e = externosDaJanela(ext, j.trimestres);
  return { chave: j.chave, rotulo: j.rotulo, parcial: j.parcial, patrimar: { lancamentos: pat(1), vendas: pat(9), receita: pat(25) }, externos: e };
}

/** Série trimestral para os gráficos e as correlações. */
export function serieTrimestral(ix, ext) {
  const S = ext.series;
  const vendas = C.serieTri(ix, 9).map((x) => x.valor);
  const ltm = C.serieLTM(ix, 9).map((x) => x.valor);
  const margem = C.serieTri(ix, 28).map((x) => x.valor);
  const aa = (arr, k) => (k >= 4 && arr[k] !== null && arr[k - 4] !== null && arr[k - 4] > 0 ? (arr[k] / arr[k - 4] - 1) * 100 : null);
  const concess = ix.tri.map((q) => somaMeses(mapaMensal(S.credito_imob_concessoes), mesesDosTrimestres([q])));
  return ix.tri.map((q, k) => {
    const meses = mesesDosTrimestres([q]);
    const sel = selicJanela(S.meta_selic, meses);
    return {
      periodo: q,
      selicFim: sel.fim,
      incc12m: acumulado(mapaMensal(S.incc_mensal), ultimos12(meses[2])),
      ipca12m: acumulado(mapaMensal(S.ipca_mensal), ultimos12(meses[2])),
      vendasLtmAA: aa(ltm, k),
      vendasAA: aa(vendas, k),
      margem: margem[k],
      concessoes: concess[k],
      concessoesAA: aa(concess, k),
    };
  });
}

/** Correlação de Pearson entre pares com os dois valores presentes. Devolve { r, n } (r null se n < 5 ou variância zero). */
export function pearson(xs, ys) {
  const par = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x !== null && x !== undefined && y !== null && y !== undefined);
  const n = par.length;
  if (n < 5) return { r: null, n };
  const mx = par.reduce((s, [x]) => s + x, 0) / n, my = par.reduce((s, [, y]) => s + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of par) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx === 0 || syy === 0 ? { r: null, n } : { r: sxy / Math.sqrt(sxx * syy), n };
}

/** Correlação entre x(t) e y(t + atraso), com o atraso em trimestres (a referência vem antes). */
export function correlacaoComAtraso(serie, campoX, campoY, atraso) {
  const xs = serie.map((s) => s[campoX]);
  const ys = serie.map((s, k) => (serie[k + atraso] ? serie[k + atraso][campoY] : null));
  return { atraso, ...pearson(xs, ys) };
}

export function forcaCorrelacao(r) {
  if (r === null) return "sem leitura";
  const a = Math.abs(r);
  const f = a < 0.3 ? "fraca" : a < 0.6 ? "moderada" : "forte";
  return `${f} e ${r >= 0 ? "positiva" : "negativa"}`;
}
