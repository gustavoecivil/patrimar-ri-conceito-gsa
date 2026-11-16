// Assistente de RI, determinístico: sem modelo generativo, sem inferência não documentada.
// Gêmeo em JavaScript de engine.py: lê os MESMOS arquivos (data_site.json e anotacoes.json) e responde IGUAL ao Python,
// palavra por palavra (testes/paridade.py prova). Toda resposta traz período, valor e fonte; ausência não é zero.
import * as C from "./calculos.js";

const SITE_OFICIAL = "https://ri.patrimar.com.br/";

// ---------------------------------------------------------------- texto e números (idênticos ao Python)

export function norm(texto) {
  return String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** toFixed usa o valor binário exato e arredonda o empate para longe do zero, como o Decimal do Python. */
export function fixo(v, casas) {
  return Number(v).toFixed(casas);
}

export function numero(v, casas) {
  const s = fixo(Math.abs(v), casas);
  const [inteiro, frac] = s.split(".");
  const r = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (frac ? "," + frac : "");
  return (v < 0 ? "-" : "") + r;
}

export function fmtValor(v, unidade, bi = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/d";
  const neg = v < 0 ? "-" : "";
  const a = Math.abs(v);
  switch (unidade) {
    case "BRL_MILHOES": return a >= 1000 ? `${neg}R$ ${numero(a / 1000, bi)} bi` : `${neg}R$ ${numero(a, 1)} mi`;
    case "PERCENTUAL": return `${numero(v, 1)}%`;
    case "UNIDADES": return `${numero(v, 0)} un.`;
    case "BRL_MIL_POR_UNIDADE": return `${neg}R$ ${numero(a, 1)} mil/un.`;
    case "anos": return `${numero(v, 1)} anos`;
    case "x": return `${numero(v, 2)}x`;
    case "%": return `${numero(v, 0)}%`;
    default: return numero(v, 2);
  }
}

const sinal = (v, casas) => (v >= 0 ? "+" : "-") + numero(Math.abs(v), casas);

function textoComp(c, unidade) {
  if (c === null) return "sem base de comparação";
  if (c.tipo === "pct") return sinal(c.valor, 1) + "%";
  if (c.tipo === "pp") return sinal(c.valor, 1) + " p.p.";
  return "diferença de " + (c.valor < 0 ? "-" : "+") + fmtValor(Math.abs(c.valor), unidade);
}

const tem = (padrao, q) => padrao.test(q);

// ---------------------------------------------------------------- vocabulário

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "o", "a", "os", "as", "um", "uma", "para", "por", "com", "qual", "quais", "quanto", "quantos", "foi", "foram", "ser", "sao"]);
const ORDINAIS = { primeiro: 1, segundo: 2, terceiro: 3, quarto: 4 };

const INDICE = {
  cobertura_landbank: ["Cobertura do landbank", "maior_melhor", "anos", "Landbank (VGV) ÷ lançamentos dos últimos 12 meses"],
  liquidez_curto_prazo: ["Liquidez de curto prazo", "maior_melhor", "x", "Caixa e equivalentes ÷ empréstimos e financiamentos do circulante"],
  cobertura_divida_recebiveis: ["Cobertura da dívida pelos recebíveis", "maior_melhor", "x", "(Contas a receber de curto + longo prazo) ÷ (empréstimos do circulante + do não circulante)"],
  alavancagem: ["Alavancagem (dívida líquida sobre patrimônio líquido)", "menor_melhor", "%", "(Empréstimos de curto + longo prazo − caixa − títulos e valores mobiliários) ÷ patrimônio líquido × 100. Inclui o financiamento à construção."],
  caixa_operacional_12m: ["Caixa operacional dos últimos 12 meses", "maior_melhor", "BRL_MILHOES", "Soma dos últimos 4 trimestres do caixa líquido das atividades operacionais"],
};
const INDICE_PADROES = [
  ["liquidez_curto_prazo", /liquidez/],
  ["cobertura_divida_recebiveis", /cobertura da divida|cobertura de divida|recebiveis.*divida|divida.*recebiveis/],
  ["alavancagem", /alavancagem/],
  ["caixa_operacional_12m", /(caixa operacional|geracao de caixa).*(12 meses|doze meses|ltm|ultimos 12|ultimos doze|acumulado)|(12 meses|doze meses|ltm).*(caixa operacional|geracao de caixa)/],
];
const ROTULO_SELO = { atencao: "atenção", confortavel: "confortável", sem_historico: "sem histórico suficiente" };

export const SUGESTOES = "Posso consultar lançamentos, vendas, receita, lucro, margens, landbank, caixa, patrimônio líquido e os demais indicadores da planilha. " +
  "Pergunte, por exemplo: \"Quanto foram as vendas líquidas no 3T26?\", \"Qual o recorde de vendas em unidades?\", " +
  "\"Quanto o landbank cobre?\", \"Quais os pontos de atenção?\" ou \"Me mostre o release do 2T26\".";

export const PERGUNTAS_SUGERIDAS = [
  "Quanto foram as vendas líquidas no 3T26?",
  "Qual o recorde de vendas em unidades?",
  "Quanto o landbank cobre?",
  "Quais os pontos de atenção?",
  "Qual a alavancagem?",
  "Me mostre o release do 2T26",
];

// ---------------------------------------------------------------- assistente

export function criarAssistente(ds, an) {
  const ix = C.indexar(ds);
  const urlPlanilha = ds.meta.fonte_planilha.url;
  const docs = [...ds.documentos].sort((a, b) => b.ano - a.ano || (b.tri ?? 0) - (a.tri ?? 0) || a.id - b.id);
  const sing = (t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
  const tokens = (t) => norm(t).match(/[a-z0-9]+/g) ?? [];
  const tokensInd = new Map(ds.indicadores.map((i) => [i.id, new Set(tokens(i.rotulo).filter((t) => !STOP.has(t) && (t.length >= 3 || /^\d+$/.test(t))).map(sing))]));
  const idsOrdenados = [...tokensInd.keys()].sort((a, b) => a - b);

  const r = (status, intent, answer, url = null, rotulo = null, periodo = null, metrica = null) =>
    ({ status, intent, answer: answer.replace(/un\.\./g, "un."), source_url: url, source_label: rotulo, period: periodo, metric_id: metrica });

  const baseDoPeriodo = (p) => (/^[1-4]T\d{2}$/.test(p) ? C.mesmoTrimestreAnoAnterior(p) : /^\d{4}$/.test(p) ? String(Number(p) - 1) : null);
  const ultimoTri = (id) => {
    const u = C.ultimoComDado(C.serieTri(ix, id));
    return u ? [u.periodo, u.valor] : [null, null];
  };

  function parsePeriodo(q) {
    let m = q.match(/(?<![0-9a-z])([1-4])\s*t\s*(?:20)?(2[0-6])(?![0-9])/);
    if (m) return `${m[1]}T${m[2]}`;
    m = q.match(/(primeiro|segundo|terceiro|quarto)\s+trimestre\s+(?:de\s+)?(?:20)?(2[0-6])(?![0-9])/);
    if (m) return `${ORDINAIS[m[1]]}T${m[2]}`;
    m = q.match(/(?<![0-9])(20(?:2[0-6]))(?![0-9])/);
    return m ? m[1] : null;
  }

  function resolverMetrica(q) {
    const un = tem(/unidades?|apartamentos/, q);
    if (tem(/landbank|banco de terrenos|estoque de terrenos/, q)) return un ? 22 : 21;
    if (tem(/lucro bruto/, q)) return 27;
    if (tem(/margem liquida/, q)) return 41;
    if (tem(/margem/, q)) return 28;
    if (tem(/lucro|prejuizo|resultado liquido/, q)) return 40;
    if (tem(/receita/, q)) return 25;
    if (tem(/caixa operacional|geracao de caixa|fluxo de caixa operacional/, q)) return 73;
    if (tem(/contas a receber.*longo prazo|recebiveis.*longo prazo/, q)) return 102;
    if (tem(/contas a receber|recebiveis/, q)) return 95;
    if (tem(/emprestimos?|financiamentos?|divida bruta/, q)) return tem(/longo prazo/, q) ? 128 : 115;
    if (tem(/caixa/, q)) return 93;
    if (tem(/patrimonio liquido|\bpl\b/, q)) return 146;
    if (tem(/ativos? totais?/, q)) return 114;
    if (tem(/preco medio|ticket medio/, q)) return 17;
    if (tem(/vend/, q)) return un ? 13 : 9;
    if (tem(/lanc/, q)) return un ? 5 : 1;
    const toks = new Set(tokens(q).map(sing));
    let melhor = null;
    for (const i of idsOrdenados) {
      const t = tokensInd.get(i);
      if (t.size && [...t].every((x) => toks.has(x)) && (melhor === null || t.size > melhor[0])) melhor = [t.size, i];
    }
    return melhor ? melhor[1] : null;
  }

  // ---- valor e comparação

  function respValor(id, per, q) {
    const ind = ix.ind.get(id);
    const un = ind.unidade;
    const [ultP, ultV] = ultimoTri(id);
    const p = per ?? ultP;
    const v = C.valor(ix, id, p);
    if (v === null) {
      return r("missing", "valor", `Não há dado para ${ind.rotulo} em ${p}. O último período com dado é ${ultP}: ${fmtValor(ultV, un)}. Ausência de dado não é zero. Fonte: planilha oficial.`, urlPlanilha, "Planilha oficial", p, id);
    }
    let txt = `${ind.rotulo}, ${p}: ${fmtValor(v, un)}.`;
    const pb = baseDoPeriodo(p);
    const vb = pb ? C.valor(ix, id, pb) : null;
    if (vb !== null) txt += ` Contra ${pb}: ${fmtValor(vb, un)} (${textoComp(C.compararValores(v, vb, un), un)}).`;
    else if (tem(/compar|evolu|vari|cresce|queda|contra|versus|mudou|a\/a|ano anterior/, q)) txt += ` Não há valor de ${pb} para comparar.`;
    if (ind.tipo === "estoque") txt += " Saldo de fim de período, não se soma entre trimestres.";
    if (id === 28) txt += " É a margem bruta contábil da planilha; o release destaca a margem ajustada, que é outra medida.";
    const cel = C.enderecoCelula(ix, id, p);
    txt += ` Fonte: planilha oficial, célula ${cel}.`;
    return r("ok", "valor", txt, urlPlanilha, `Planilha oficial, célula ${cel}`, p, id);
  }

  // ---- recorde e mínimo

  function respExtremo(id, per, modo) {
    const ind = ix.ind.get(id);
    const un = ind.unidade;
    const anual = per !== null && /^\d{4}$/.test(per);
    const periodos = anual ? ix.anos : ix.tri;
    const valores = anual ? ind.ano : ind.tri;
    const pts = periodos.map((p, k) => [p, valores[k]]).filter(([, v]) => v !== null && v !== undefined);
    const alvo = modo === "max" ? Math.max(...pts.map(([, v]) => v)) : Math.min(...pts.map(([, v]) => v));
    const donos = pts.filter(([, v]) => v === alvo).map(([p]) => p);
    const unico = donos.length === 1;
    const nome = modo === "max" ? "recorde" : "mínimo";
    const extremo = modo === "max" ? "máximo" : "mínimo";
    const serie = anual ? "anual" : "trimestral";
    const rot = `Planilha oficial, linha ${ind.linha}`;
    const vp = per !== null ? C.valor(ix, id, per) : null;
    if (per !== null && vp !== null) {
      let txt;
      if (unico) {
        const eh = donos[0] === per;
        txt = `O ${per} ${eh ? "é" : "não é"} o ${nome} da série ${serie} de ${ind.rotulo}: ${fmtValor(vp, un)}. O ${extremo} é ${fmtValor(alvo, un)} em ${donos[0]}.`;
      } else {
        txt = `O ${per} tem ${fmtValor(vp, un)} em ${ind.rotulo}. O ${extremo} da série, ${fmtValor(alvo, un)}, se repete em ${donos.length} períodos (${donos.join(", ")}): não há ${nome} único.`;
      }
      return r("ok", nome, `${txt} Fonte: planilha oficial, linha ${ind.linha}.`, urlPlanilha, rot, per, id);
    }
    const de = pts[0][0], ate = pts[pts.length - 1][0];
    const [lp, lv] = pts[pts.length - 1];
    const titulo = modo === "max" ? "Maior" : "Menor";
    const txt = unico
      ? `${titulo} valor de ${ind.rotulo} na série ${serie} (${de} a ${ate}): ${fmtValor(alvo, un)} em ${donos[0]}. Último dado: ${lp}, ${fmtValor(lv, un)}.`
      : `O ${extremo} de ${ind.rotulo} na série ${serie} (${de} a ${ate}), ${fmtValor(alvo, un)}, se repete em ${donos.length} períodos (${donos.join(", ")}): não há ${nome} único. Último dado: ${lp}, ${fmtValor(lv, un)}.`;
    return r("ok", nome, `${txt} Fonte: planilha oficial, linha ${ind.linha}.`, urlPlanilha, rot, unico ? donos[0] : null, id);
  }

  // ---- cobertura do landbank

  function respCobertura(q) {
    const [p, lb] = ultimoTri(21);
    const k = ix.posTri.get(p);
    const ltm = C.lancamentos12m(ix, p);
    const m = q.match(/(?:ritmo de|lancar|lancando|lancamentos de)\s*(?:r\$\s*)?([0-9][0-9.,]*)\s*(bi|bilhao|bilhoes|milhoes|mi)\b/);
    const cel = C.enderecoCelula(ix, 21, p);
    const linhaLanc = ix.ind.get(1).linha;
    const rot = `Planilha oficial, célula ${cel} e linha ${linhaLanc}`;
    if (m) {
      const bruto = m[1];
      let num;
      if (bruto.includes(",")) num = parseFloat(bruto.replace(/\./g, "").replace(",", "."));
      else if (/^\d{1,3}(\.\d{3})+$/.test(bruto)) num = parseFloat(bruto.replace(/\./g, "")); // "1.500" é mil e quinhentos (milhar), não 1,5
      else num = parseFloat(bruto);
      const ritmo = ["bi", "bilhao", "bilhoes"].includes(m[2]) ? num * 1000 : num;
      if (ritmo > 0) {
        const txt = `Com lançamentos de ${fmtValor(ritmo, "BRL_MILHOES")} por ano, o landbank de ${fmtValor(lb, "BRL_MILHOES", 1)} (${p}) cobre ${fmtValor(lb / ritmo, "anos")} de lançamentos. Cálculo GSA: landbank ÷ ritmo anual. VGV potencial não é receita contratada. Fonte: planilha oficial, célula ${cel}.`;
        return r("ok", "cobertura", txt, urlPlanilha, rot, p, 21);
      }
    }
    const de = ix.tri[k - 3];
    const txt = `No ritmo dos últimos 12 meses (${fmtValor(ltm, "BRL_MILHOES")} lançados, de ${de} a ${p}), o landbank de ${fmtValor(lb, "BRL_MILHOES", 1)} cobre ${fmtValor(lb / ltm, "anos")} de lançamentos. Cálculo GSA: landbank ÷ lançamentos dos últimos 12 meses. VGV potencial não é receita contratada. Fonte: planilha oficial, célula ${cel} e linha ${linhaLanc}.`;
    return r("ok", "cobertura", txt, urlPlanilha, rot, p, 21);
  }

  // ---- Índice de Solidez (usa as funções puras do site)

  const avaliacoes = () => Object.fromEntries(C.indiceSolidez(ix).map((a) => [a.chave, a]));

  function respIndice(chave) {
    const a = avaliacoes()[chave];
    const [, , un] = INDICE[chave];
    const sentido = a.sentido === "maior_melhor" ? "maior" : "menor";
    let txt = `${a.nome}, ${a.atual.periodo}: ${fmtValor(a.atual.valor, un)}. Selo: ${ROTULO_SELO[a.selo]}. Média histórica: ${fmtValor(a.historico.media, un)} (${a.historico.n} trimestres anteriores, desde ${a.historico.de}). Percentil ${numero(a.percentil, 0)} da própria série; posição de qualidade ${numero(a.qualidade, 0)} de 100 (${sentido} é melhor). Fórmula: ${a.formula} Cálculo GSA sobre a planilha oficial, não é indicador divulgado pela companhia.`;
    if (chave === "alavancagem") txt += ` Contexto do release: ${an.citacoes_de_release.divida_corporativa_sobre_pl_2T26.texto}`;
    return r("ok", "indice", txt, urlPlanilha, "Planilha oficial (cálculo GSA)", a.atual.periodo, null);
  }

  function respSolidez() {
    const av = avaliacoes();
    const linhas = Object.keys(INDICE).map((chave) => {
      const a = av[chave];
      return `${a.nome}: ${fmtValor(a.atual.valor, INDICE[chave][2])} em ${a.atual.periodo}, selo ${ROTULO_SELO[a.selo]}.`;
    });
    const txt = "Índice de Solidez GSA, cinco medidas lidas contra a própria história da Patrimar:\n" + linhas.join("\n") +
      "\nCálculo GSA sobre a planilha oficial. O selo \"atenção\" marca o quarto pior da própria série; não há comparação com outras empresas.";
    return r("ok", "indice", txt, urlPlanilha, "Planilha oficial (cálculo GSA)", null, null);
  }

  // ---- pontos de atenção

  function textoMotivo(m) {
    if (m.regra === "piora_aa" || m.regra === "piora_anual") return `piorou ${numero(m.pioraPct, 1)}% contra ${m.contra}`;
    if (m.regra === "percentil") return `abaixo do percentil ${m.corte} da própria série`;
    return "valor negativo";
  }

  function respPontos() {
    const pts = C.pontosDeAtencao(ix, an.regras_pontos_de_atencao, {});
    const linhas = pts.map((p, n) => `${n + 1}. ${ix.ind.get(p.id).rotulo}, ${p.periodo}: ${fmtValor(p.valor, ix.ind.get(p.id).unidade)} (${p.motivos.map(textoMotivo).join("; ")}).`);
    const txt = `Pontos de atenção por regra, nos últimos ${C.JANELA_PONTOS} trimestres com dado: ${pts.length} ponto(s).\n${linhas.join("\n")}\nO contexto, o contrapeso e a fonte de cada um estão na seção Pontos de atenção. Não é recomendação de investimento.`;
    return r("ok", "pontos", txt, urlPlanilha, "Planilha oficial (regra GSA)", null, null);
  }

  // ---- citações de release

  const fonteDe = (c) => {
    const f = an.fontes[c.fonte];
    return [f.url, `${f.documento}, p. ${c.pagina}`];
  };

  function respVso() {
    const c = an.citacoes_de_release.vso_12_meses_3T26;
    const [url, rot] = fonteDe(c);
    return r("ok", "vso", `${c.texto} A planilha não traz a VSO trimestral em texto: este é o dado de 12 meses citado no release. Fonte: ${rot}.`, url, rot, "3T26", null);
  }

  function respDivida() {
    const a = an.citacoes_de_release;
    const t = a.divida_liquida_sobre_pl_2T26, c = a.divida_corporativa_sobre_pl_2T26;
    const [url, rot] = fonteDe(c);
    const [, rotT] = fonteDe(t);
    const txt = `${c.texto} Incluindo o financiamento à construção, a dívida líquida total é de ${numero(t.valor, 0)}% do patrimônio líquido (junho de 2026). A meta pública é zerar a dívida líquida corporativa até o fim de 2027. Fonte: ${rot} e ${rotT}.`;
    return r("ok", "divida", txt, url, rot, "2T26", null);
  }

  // ---- documentos

  const rotuloDoc = (d) => (d.tri ? `${d.tri}T${String(d.ano).slice(-2)}` : String(d.ano));

  function respDocs(q, per) {
    const tipos = [[/release/, "release"], [/\bitr\b/, "itr"], [/previa/, "previa"], [/demonstrac/, "demonstracoes"], [/apresentac/, "apresentacao"]];
    const tipo = (tipos.find(([padrao]) => tem(padrao, q)) ?? [null, null])[1];
    let lista = docs;
    if (per !== null) {
      lista = /^\d{4}$/.test(per) ? lista.filter((d) => String(d.ano) === per) : lista.filter((d) => d.tri === Number(per[0]) && d.ano === 2000 + Number(per.slice(2)));
    }
    if (tipo) lista = lista.filter((d) => d.tipo === tipo);
    if (!lista.length) {
      return r("missing", "documentos", "Não encontrei documento correspondente no recorte capturado. Consulte a Central de Resultados oficial para publicações mais recentes.", SITE_OFICIAL, "Site oficial de RI", per, null);
    }
    const txt = lista.length === 1
      ? `Documento: ${lista[0].titulo} (${rotuloDoc(lista[0])}).`
      : `${lista.length} documentos encontrados; os mais recentes: ${lista.slice(0, 5).map((d) => `${d.titulo} (${rotuloDoc(d)})`).join("; ")}.`;
    return r("ok", "documentos", txt, lista[0].url, lista[0].titulo, per, null);
  }

  // ---- entrada

  function perguntar(pergunta) {
    if (typeof pergunta !== "string" || !pergunta.trim()) {
      return r("empty", "ajuda", "Envie uma pergunta sobre os indicadores ou os documentos públicos do RI.");
    }
    const q = norm(pergunta.trim().slice(0, 700));
    const per = parsePeriodo(q);
    if (tem(/\bvso\b|velocidade de vendas/, q)) return respVso();
    if (tem(/divida liquida|divida corporativa|plano ?27/, q)) return respDivida();
    if (tem(/pontos? de atencao|o que (preocupa|piorou|pede trabalho)|alertas?/, q)) return respPontos();
    if (tem(/\bcobre\b|cobertura do landbank|cobertura de landbank|quantos anos.*(landbank|banco de terrenos|terrenos)|anos de lancamento/, q)) return respCobertura(q);
    if (tem(/indice de solidez|solidez/, q)) return respSolidez();
    for (const [chave, padrao] of INDICE_PADROES) if (tem(padrao, q)) return respIndice(chave);
    const id = resolverMetrica(q);
    if (id === null) {
      if (tem(/document|release|itr|previa|demonstrac|apresentac/, q)) return respDocs(q, per);
      return r("suggestion", "ajuda", SUGESTOES);
    }
    if (tem(/recorde|maximo|mais alto|maior/, q)) return respExtremo(id, per, "max");
    if (tem(/minimo|mais baixo|menor/, q)) return respExtremo(id, per, "min");
    return respValor(id, per, q);
  }

  return { perguntar };
}
