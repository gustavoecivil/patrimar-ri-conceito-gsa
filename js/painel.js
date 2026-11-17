// Painel da Central de Resultados: funções PURAS (sem DOM). Agregam os trimestres em janelas (trimestre, semestre, ano,
// série completa), comparam com o mesmo período do ano anterior e preparam a tabela, o CSV e os dados por região e marca.
// Ausência de dado é null e nunca vira zero: se falta um trimestre da janela, o agregado é null.
import * as C from "./calculos.js";

export const VISOES = { tri: "Trimestre", sem: "Semestre", ano: "Ano", todos: "Todos" };

/** Indicadores dos cartões do painel. */
export const KPIS_PAINEL = [1, 9, 21, 25, 28, 40, 73, 93];

/** Linhas da tabela do período (as demais ficam no CSV, que traz os 147 indicadores). */
export const TABELA_PAINEL = [
  1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 21, 25, 26, 27, 28, 29, 34, 37, 38, 39, 40, 41, 73, 81, 88, 93, 94, 95, 102, 114, 115, 128, 146,
];

// Razões que podem ser recalculadas em janelas maiores que um trimestre: id -> [numerador, denominador]
const RAZOES = { 28: [27, 25], 41: [40, 25] };
// "Caixa no início do exercício" (id 90) é um saldo de início, sem sentido em janelas: só vale no trimestre publicado.
const SO_PUBLICADO = new Set([90]);

const aa = (p) => p.slice(2);

/** Janelas de uma visão. Cada uma: { chave, rotulo, visao, trimestres, completo, parcial }. */
export function janelas(ix, visao) {
  const tri = ix.tri;
  if (visao === "tri") return tri.map((p) => ({ chave: p, rotulo: p, visao, trimestres: [p], completo: true, parcial: false }));
  if (visao === "todos") return [{ chave: "todos", rotulo: "Série completa", visao, trimestres: [...tri], completo: true, parcial: false }];
  const anos = [...new Set(tri.map(aa))];
  const saida = [];
  if (visao === "sem") {
    for (const yy of anos) {
      for (const s of [1, 2]) {
        const qs = [`${2 * s - 1}T${yy}`, `${2 * s}T${yy}`];
        if (qs.every((q) => tri.includes(q))) saida.push({ chave: `${s}S${yy}`, rotulo: `${s}S${yy}`, visao, trimestres: qs, completo: true, parcial: false });
      }
    }
    return saida;
  }
  if (visao === "ano") {
    for (const yy of anos) {
      const qs = [1, 2, 3, 4].map((t) => `${t}T${yy}`).filter((q) => tri.includes(q));
      if (qs.length === 4) saida.push({ chave: `20${yy}`, rotulo: `20${yy}`, visao, trimestres: qs, completo: true, parcial: false });
      else if (qs.length > 0) saida.push({ chave: `20${yy}p`, rotulo: `20${yy} até o ${qs.length}T${yy}`, visao, trimestres: qs, completo: false, parcial: true });
    }
    return saida;
  }
  throw new Error(`visão desconhecida: ${visao}`);
}

export function acharJanela(ix, visao, chave) {
  const lista = janelas(ix, visao);
  return lista.find((j) => j.chave === chave) ?? lista[lista.length - 1];
}

/** Janela de comparação: o mesmo período um ano antes. null se não existir no conjunto de dados. */
export function janelaAnterior(ix, j) {
  if (j.visao === "todos") return null;
  const qs = j.trimestres.map((q) => `${q[0]}T${String(Number(aa(q)) - 1).padStart(2, "0")}`);
  if (!qs.every((q) => ix.tri.includes(q))) return null;
  const yy = String(Number(aa(j.trimestres[0])) - 1).padStart(2, "0");
  if (j.visao === "tri") return { chave: qs[0], rotulo: qs[0], visao: "tri", trimestres: qs, completo: true, parcial: false };
  if (j.visao === "sem") return { chave: `${j.chave[0]}S${yy}`, rotulo: `${j.chave[0]}S${yy}`, visao: "sem", trimestres: qs, completo: true, parcial: false };
  if (j.parcial) return { chave: `20${yy}p`, rotulo: `20${yy} até o ${qs.length}T${yy}`, visao: "ano", trimestres: qs, completo: false, parcial: true };
  return { chave: `20${yy}`, rotulo: `20${yy}`, visao: "ano", trimestres: qs, completo: true, parcial: false };
}

/**
 * Valor de um indicador em uma janela.
 *  - um trimestre: o valor publicado;
 *  - ano completo: o valor anual publicado pela planilha, quando existe (senão a soma ou o saldo dos trimestres);
 *  - demais janelas: fluxo soma os trimestres, saldo fica com o último, razão é recalculada (margens) ou fica n/d.
 */
export function agregar(ix, id, j) {
  const ind = ix.ind.get(id);
  if (!ind) return null;
  if (j.trimestres.length === 1) return C.valor(ix, id, j.trimestres[0]);
  if (SO_PUBLICADO.has(id)) return null;
  if (j.visao === "ano" && j.completo) {
    const anual = C.valor(ix, id, j.chave);
    if (anual !== null) return anual;
  }
  if (ind.tipo === "razao") {
    const r = RAZOES[id];
    if (!r) return null;
    const n = agregar(ix, r[0], j);
    const d = agregar(ix, r[1], j);
    return n === null || d === null || d === 0 ? null : (n / d) * 100;
  }
  const v = j.trimestres.map((q) => C.valor(ix, id, q));
  if (v.some((x) => x === null)) return null;
  return ind.tipo === "estoque" ? v[v.length - 1] : v.reduce((a, b) => a + b, 0);
}

/** Como o valor da janela foi obtido, em palavras (aparece na tela e no CSV). Vazio quando não há valor. */
export function fonteJanela(ix, id, j) {
  const valor = agregar(ix, id, j);
  if (valor === null) return "";
  if (j.trimestres.length === 1) return C.origemValor(ix, id, j.trimestres[0])?.texto ?? "";
  if (j.visao === "ano" && j.completo && C.valor(ix, id, j.chave) !== null) return `Planilha oficial, coluna anual ${j.chave}`;
  const de = j.trimestres[0], ate = j.trimestres[j.trimestres.length - 1];
  const razao = RAZOES[id];
  if (ix.ind.get(id).tipo === "razao" && razao) return `Cálculo GSA: ${ix.ind.get(razao[0]).rotulo} ÷ ${ix.ind.get(razao[1]).rotulo} do período, ${de} a ${ate}`;
  return `Cálculo GSA: ${ix.ind.get(id).tipo === "estoque" ? "saldo do último trimestre" : "soma dos trimestres"} ${de} a ${ate}`;
}

/** Cartões do painel para uma janela: valor, base de comparação e variação (a/a). */
export function kpisJanela(ix, j) {
  const ant = janelaAnterior(ix, j);
  return KPIS_PAINEL.map((id) => {
    const i = ix.ind.get(id);
    const valor = agregar(ix, id, j);
    const base = ant ? agregar(ix, id, ant) : null;
    const origem = j.trimestres.length === 1 ? C.origemValor(ix, id, j.trimestres[0]) : null;
    return { id, rotulo: i.rotulo, unidade: i.unidade, tipo: i.tipo, valor, base, periodoBase: ant ? ant.rotulo : null, comp: C.compararValores(valor, base, i.unidade), origem };
  });
}

export function linhasTabela(ix, j) {
  const ant = janelaAnterior(ix, j);
  return TABELA_PAINEL.map((id) => {
    const i = ix.ind.get(id);
    const valor = agregar(ix, id, j);
    const base = ant ? agregar(ix, id, ant) : null;
    return { id, rotulo: i.rotulo, secao: i.secao, unidade: i.unidade, tipo: i.tipo, valor, base, comp: C.compararValores(valor, base, i.unidade) };
  });
}

/** Evolução de um indicador nas últimas n janelas da visão, terminando na janela escolhida. */
export function serieJanelas(ix, id, visao, chave, n = 12) {
  const lista = janelas(ix, visao);
  const k = lista.findIndex((j) => j.chave === chave);
  const fim = k < 0 ? lista.length : k + 1;
  return lista.slice(Math.max(0, fim - n), fim).map((j) => ({ chave: j.chave, rotulo: j.rotulo, valor: agregar(ix, id, j), selecionada: j.chave === chave }));
}

/** Código do período no banco para os dados por região e marca: só trimestre, 1º semestre, 9 meses e ano completo existem. */
export function periodoDoRecorte(j) {
  if (j.visao === "tri") return j.trimestres[0];
  if (j.visao === "sem" && j.chave[0] === "1") return `6M${aa(j.trimestres[0])}`;
  if (j.visao === "ano" && j.completo) return j.chave;
  if (j.visao === "ano" && j.parcial && j.trimestres.length === 3) return `9M${aa(j.trimestres[0])}`;
  if (j.visao === "ano" && j.parcial && j.trimestres.length === 2) return `6M${aa(j.trimestres[0])}`;
  return null;
}

const ORDEM_RECORTE = { REGIAO: ["Minas Gerais", "Rio de Janeiro", "São Paulo"], MARCA: ["Patrimar", "Novolar", "Não Controlado"] };

/** Lançamentos e vendas por região e marca de uma janela. Devolve null quando o banco não tem o período. */
export function recortesJanela(dp, j) {
  const per = periodoDoRecorte(j);
  if (!per) return null;
  const saida = { periodo: per, lancamentos: { REGIAO: [], MARCA: [] }, vendas: { REGIAO: [], MARCA: [] } };
  let achou = false;
  for (const o of dp.recortes) {
    if (o.p !== per) continue;
    achou = true;
    saida[o.m][o.t].push({ recorte: o.r, valor: o.v, status: o.s, documento: o.d, pagina: o.pg });
  }
  if (!achou) return null;
  for (const m of ["lancamentos", "vendas"]) {
    for (const t of ["REGIAO", "MARCA"]) saida[m][t].sort((a, b) => ORDEM_RECORTE[t].indexOf(a.recorte) - ORDEM_RECORTE[t].indexOf(b.recorte));
  }
  return saida;
}

const ORDEM_TIPO = { release: 0, itr: 1, previa: 2, demonstracoes: 3, apresentacao: 4, outro: 5 };

/** Documentos originais dos trimestres da janela (e as demonstrações do ano, que saem no 4T). */
export function documentosJanela(ds, j) {
  const chaves = new Set(j.trimestres.map((q) => `${2000 + Number(aa(q))}-${q[0]}`));
  return ds.documentos
    .filter((d) => chaves.has(`${d.ano}-${d.tri}`))
    .sort((a, b) => (b.ano - a.ano) || (b.tri - a.tri) || ((ORDEM_TIPO[a.tipo] ?? 9) - (ORDEM_TIPO[b.tipo] ?? 9)));
}

const SEC = { OPERACIONAL: "Operacional", DRE: "DRE", FLUXO_CAIXA: "Fluxo de caixa", BALANCO: "Balanço" };
const NAT = { fluxo: "Fluxo", estoque: "Saldo", razao: "Razão" };
const UN = { BRL_MILHOES: "R$ milhões", UNIDADES: "unidades", PERCENTUAL: "%", BRL_MIL_POR_UNIDADE: "R$ mil por unidade", BRL_MIL: "R$ mil" };

const num = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/** CSV do período (separador ponto e vírgula, decimal com vírgula, BOM para o Excel): os 147 indicadores, com comparação e fonte. */
export function csvJanela(ix, j) {
  const ant = janelaAnterior(ix, j);
  const cab = ["id", "indicador", "seção", "unidade", "natureza", "período", "valor", "período de comparação", "valor de comparação", "variação", "tipo de variação", "fonte"];
  const linhas = [cab];
  for (const i of ix.ds.indicadores) {
    const valor = agregar(ix, i.id, j);
    const base = ant ? agregar(ix, i.id, ant) : null;
    const comp = C.compararValores(valor, base, i.unidade);
    const fonte = fonteJanela(ix, i.id, j);
    linhas.push([i.id, i.rotulo, SEC[i.secao] ?? i.secao, UN[i.unidade] ?? i.unidade, NAT[i.tipo] ?? i.tipo, j.rotulo, num(valor), ant ? ant.rotulo : "", num(base),
      comp ? num(Math.round(comp.valor * 1000) / 1000) : "", comp ? { pct: "%", pp: "p.p.", abs: "diferença absoluta" }[comp.tipo] : "", fonte]);
  }
  const celula = (x) => {
    const t = String(x);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}
