// Formatação em português do Brasil. Funções puras. Ausência de dado é sempre "n/d", nunca zero.

export const ND = "n/d";

export function nf(n, casas = 1) {
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Valor com unidade. Sinal negativo vem antes do R$ ("-R$ 30,3 mi"). */
export function fmtValor(v, unidade, { bi = 2 } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return ND;
  const neg = v < 0 ? "-" : "";
  const a = Math.abs(v);
  switch (unidade) {
    case "BRL_MILHOES":
      return a >= 1000 ? `${neg}R$ ${nf(a / 1000, bi)} bi` : `${neg}R$ ${nf(a, 1)} mi`;
    case "PERCENTUAL":
      return `${nf(v, 1)}%`;
    case "UNIDADES":
      return `${nf(v, 0)} un.`;
    case "BRL_MIL_POR_UNIDADE":
      return `${neg}R$ ${nf(a, 1)} mil/un.`;
    case "anos":
      return `${nf(v, 1)} anos`;
    case "x":
      return `${nf(v, 2)}x`;
    case "%":
      return `${nf(v, 0)}%`;
    default:
      return nf(v, 2);
  }
}

export function fmtPct(v, casas = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return ND;
  return `${v >= 0 ? "+" : "-"}${nf(Math.abs(v), casas)}%`;
}

/** "2T26" fica como está; "2025" vira "ano de 2025". */
export function rotuloPeriodo(p) {
  return /^\d{4}$/.test(p) ? `ano de ${p}` : p;
}

export const ROTULO_TIPO_INDICADOR = { fluxo: "Fluxo", estoque: "Saldo", razao: "Razão" };
export const ROTULO_SECAO = { OPERACIONAL: "Operacional", DRE: "Resultado (DRE)", FLUXO_CAIXA: "Fluxo de caixa", BALANCO: "Balanço" };
