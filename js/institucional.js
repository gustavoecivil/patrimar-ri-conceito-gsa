// Conteúdo institucional (A Companhia, Governança, Serviços RI): funções PURAS, sem DOM.
// Os textos vêm de data_institucional.json (fiéis às páginas oficiais). Aqui só se calcula: ritmo de divulgação,
// quem ocupa quais cadeiras, anos de casa da diretoria e as provas numéricas de cada tese de investimento.
import * as C from "./calculos.js";
import * as P from "./painel.js";

const mediana = C.mediana;

// ------------------------------------------------------------------ calendário e ritmo de divulgação

/**
 * Eventos de resultado e de prévia viram séries de "dias depois do fim do trimestre". Trimestres em ordem cronológica.
 * O resultado do ano (demonstrações financeiras) e a prévia do ano entram como 4T, marcados com anual = true:
 * o balanço anual leva mais tempo e não deve entrar na mediana dos trimestres comuns.
 */
export function ritmoDivulgacao(cal) {
  const tri = new Map();
  for (const e of cal.eventos) {
    if (e.dias_apos_fim === null) continue;
    if (!["resultado", "previa", "resultado_anual", "previa_anual"].includes(e.tipo)) continue;
    const anual = e.tipo.endsWith("_anual");
    const ref = anual ? `4T${e.ref.slice(2)}` : e.ref;
    const o = tri.get(ref) ?? { ref, anual, previa: null, resultado: null, dataPrevia: null, dataResultado: null };
    if (e.tipo.startsWith("previa")) { o.previa = e.dias_apos_fim; o.dataPrevia = e.data; }
    else { o.resultado = e.dias_apos_fim; o.dataResultado = e.data; }
    tri.set(ref, o);
  }
  const ordem = (r) => Number(r.slice(2)) * 10 + Number(r[0]);
  const trimestres = [...tri.values()].sort((a, b) => ordem(a.ref) - ordem(b.ref));
  const res = trimestres.filter((x) => x.resultado !== null && !x.anual);
  const resAnual = trimestres.filter((x) => x.resultado !== null && x.anual);
  const pre = trimestres.filter((x) => x.previa !== null);
  const ult = (lista, campo, n) => lista.slice(-n).map((x) => x[campo]);
  return {
    trimestres,
    medianaResultado8: res.length >= 8 ? mediana(ult(res, "resultado", 8)) : null,
    minResultado8: res.length >= 8 ? Math.min(...ult(res, "resultado", 8)) : null,
    maxResultado8: res.length >= 8 ? Math.max(...ult(res, "resultado", 8)) : null,
    medianaPrevia: pre.length >= 4 ? mediana(pre.map((x) => x.previa)) : null,
    nPrevias: pre.length,
    medianaAnual: resAnual.length ? mediana(resAnual.map((x) => x.resultado)) : null,
    nAnual: resAnual.length,
    maiorAtraso: res.length ? res.reduce((m, x) => (x.resultado > m.resultado ? x : m)) : null,
  };
}

/** Data (aaaa-mm-dd) de hoje no fuso local, só para decidir passado e futuro. */
export function hojeISO(agora = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** Evento em destaque: o próximo se ainda não passou; senão o último realizado, avisando que o calendário oficial ficou para trás. */
export function eventoEmDestaque(cal, hoje) {
  const prox = cal.proximo;
  if (prox.data >= hoje) return { evento: prox, situacao: "futuro", dias: diasEntre(hoje, prox.data) };
  return { evento: prox, situacao: "previsto_ja_passou", dias: -diasEntre(prox.data, hoje) };
}

export function diasEntre(a, b) {
  const t = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86400000);
}

export function anosDoCalendario(cal) {
  return [...new Set(cal.eventos.map((e) => e.data.slice(0, 4)))].sort().reverse();
}

export const TIPOS_EVENTO = {
  resultado: "Resultado do trimestre", resultado_anual: "Resultado do ano", previa: "Prévia operacional", previa_anual: "Prévia operacional",
  assembleia: "Assembleia", formularios: "Formulários", governanca: "Governança", outro: "Outros",
};

export function eventosDoAno(cal, ano, tipo = "todos") {
  return cal.eventos
    .filter((e) => e.data.startsWith(ano) && (tipo === "todos" || e.tipo === tipo || (tipo === "previa" && e.tipo === "previa_anual") || (tipo === "resultado" && e.tipo === "resultado_anual")))
    .sort((a, b) => (a.data < b.data ? 1 : -1));
}

// ------------------------------------------------------------------ governança

export const ORGAOS = ["Diretoria", "Conselho", "Auditoria, Compliance e Risco", "ESG", "Estratégia", "Finanças", "Gente e Cultura"];

/** Matriz pessoa x órgão. Cada célula: o cargo da pessoa no órgão, ou null. Pessoas ordenadas por número de cadeiras. */
export function matrizCadeiras(gov) {
  const mapa = new Map();
  const por = (orgao, lista) => {
    for (const p of lista) {
      const o = mapa.get(p.chave) ?? { chave: p.chave, nome: p.nome, cadeiras: {} };
      o.cadeiras[orgao] = p.cargo;
      mapa.set(p.chave, o);
    }
  };
  por("Diretoria", gov.diretoria);
  por("Conselho", gov.conselho);
  gov.comites.forEach((c, i) => por(ORGAOS[2 + i], c.membros));
  const pessoas = [...mapa.values()].map((o) => ({ ...o, total: Object.keys(o.cadeiras).length }));
  pessoas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  return { orgaos: ORGAOS, pessoas, pessoasUnicas: pessoas.length, cadeirasTotal: pessoas.reduce((s, p) => s + p.total, 0) };
}

/** Resumo da composição do conselho e dos comitês, contado a partir dos cargos publicados. */
export function resumoGovernanca(gov) {
  const independentes = gov.conselho.filter((p) => /independente/i.test(p.cargo)).length;
  const dir = gov.diretoria.filter((p) => p.anos_patrimar !== null);
  return {
    conselho: gov.conselho.length, independentes, pctIndependentes: gov.conselho.length ? (independentes / gov.conselho.length) * 100 : null,
    diretores: gov.diretoria.length,
    medianaAnosPatrimar: dir.length ? mediana(dir.map((p) => p.anos_patrimar)) : null,
    medianaAnosMercado: mediana(gov.diretoria.filter((p) => p.anos_mercado !== null).map((p) => p.anos_mercado)),
    comites: gov.comites.length,
    membrosComites: gov.comites.reduce((s, c) => s + c.membros.length, 0),
  };
}

/** Anos de Patrimar e anos de mercado de cada diretor, para o gráfico de pares. Ordenado por anos de Patrimar. */
export function anosDiretoria(gov) {
  return gov.diretoria
    .map((p) => ({ nome: p.nome, cargo: p.cargo, patrimar: p.anos_patrimar, mercado: p.anos_mercado }))
    .sort((a, b) => (b.patrimar ?? -1) - (a.patrimar ?? -1));
}

export function documentosPorGrupo(gov) {
  const d = gov.documentos;
  return [
    { chave: "estatuto", titulo: "Estatuto Social", itens: d.estatuto },
    { chave: "politicas", titulo: "Políticas internas e regimentos", itens: d.politicas },
    { chave: "codigo", titulo: "Informe do Código de Governança", itens: d.codigo_governanca },
    { chave: "formulario", titulo: "Formulários de Referência e Cadastral", itens: d.formulario },
    { chave: "apresentacoes", titulo: "Apresentações", itens: d.apresentacoes },
    { chave: "cvm", titulo: "Documentos entregues à CVM", itens: d.cvm },
  ];
}

export function categoriasCvm(itens) {
  const n = new Map();
  for (const i of itens) n.set(i.categoria, (n.get(i.categoria) ?? 0) + 1);
  return [...n.entries()].map(([categoria, total]) => ({ categoria, total }));
}

// ------------------------------------------------------------------ história e perfil

export const ERAS = [
  { chave: "origem", rotulo: "Origem e consolidação", de: 1963, ate: 1999 },
  { chave: "marcas", rotulo: "Duas marcas e expansão", de: 2000, ate: 2014 },
  { chave: "gestao", rotulo: "Profissionalização da gestão", de: 2015, ate: 2019 },
  { chave: "ciclo", rotulo: "Novo ciclo de capital e certificações", de: 2020, ate: 2024 },
];

export function marcosPorEra(historia, chave) {
  const era = ERAS.find((e) => e.chave === chave);
  return historia.linha.filter((a) => !era || (a.ano >= era.de && a.ano <= era.ate));
}

export function totalCaptacoes(fatos) {
  return fatos.captacoes.reduce((s, c) => s + c.valor_milhoes, 0);
}

export function gruposSustentabilidade(sus) {
  const n = new Map();
  for (const m of sus.melhorias) n.set(m.grupo, (n.get(m.grupo) ?? 0) + 1);
  return [...n.entries()].map(([grupo, total]) => ({ grupo, total })).sort((a, b) => b.total - a.total || a.grupo.localeCompare(b.grupo, "pt-BR"));
}

// ------------------------------------------------------------------ provas numéricas das teses

/** Valor de um indicador numa janela anual completa e a comparação com o ano anterior (valores publicados, como no painel). */
function fatoAnual(ix, id, ano) {
  const j = P.acharJanela(ix, "ano", ano);
  const ant = P.janelaAnterior(ix, j);
  const valor = P.agregar(ix, id, j);
  const base = ant ? P.agregar(ix, id, ant) : null;
  const i = ix.ind.get(id);
  return { id, rotulo: i.rotulo, unidade: i.unidade, periodo: j.rotulo, valor, periodoBase: ant ? ant.rotulo : null, base, comp: C.compararValores(valor, base, i.unidade) };
}

/** Participação de Minas Gerais na soma das regiões, para a janela anual (lançamentos e vendas). null se não houver dado. */
export function participacaoMinas(dp, ix, ano) {
  const j = P.acharJanela(ix, "ano", ano);
  const r = P.recortesJanela(dp, j);
  if (!r) return null;
  const saida = { periodo: r.periodo, rotulo: j.rotulo };
  for (const m of ["lancamentos", "vendas"]) {
    const regs = r[m].REGIAO;
    const total = regs.reduce((s, x) => s + x.valor, 0);
    const mg = regs.find((x) => x.recorte === "Minas Gerais");
    saida[m] = total > 0 && mg ? { pct: (mg.valor / total) * 100, mg: mg.valor, total, documento: mg.documento, pagina: mg.pagina } : null;
  }
  return saida;
}

/**
 * Prova numérica de cada uma das cinco teses do site oficial. Só números já publicados e já auditados no restante da página.
 * Cada fato leva rótulo, valor, unidade, comparação e a origem, para a interface escrever a fonte.
 */
export function provasDasTeses(ix, an, dp) {
  const anoCheio = [...ix.anos].filter((a) => /^\d{4}$/.test(a)).sort().filter((a) => P.janelas(ix, "ano").some((j) => j.chave === a && j.completo)).pop();
  const p = C.provasSolidez(ix, an);
  const solidez = Object.fromEntries(C.indiceSolidez(ix).map((a) => [a.chave, a]));
  const mg = participacaoMinas(dp, ix, anoCheio);
  return {
    anoCheio,
    teses: [
      { chave: "lideranca", fatos: [{ tipo: "anual", ...fatoAnual(ix, 1, anoCheio) }, { tipo: "anual", ...fatoAnual(ix, 9, anoCheio) }] },
      { chave: "regional", mg },
      { chave: "landbank", terreno: p.terreno },
      { chave: "estrutura", alavancagem: solidez.alavancagem, liquidez: solidez.liquidez_curto_prazo, caixaOp: solidez.caixa_operacional_12m, patrimonio: p.balanco.patrimonio },
      { chave: "resultados", fatos: [{ tipo: "anual", ...fatoAnual(ix, 25, anoCheio) }, { tipo: "anual", ...fatoAnual(ix, 28, anoCheio) }, { tipo: "anual", ...fatoAnual(ix, 40, anoCheio) }] },
    ],
  };
}
