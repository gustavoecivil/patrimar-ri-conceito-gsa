// Interface do conteúdo institucional: A Companhia, Governança e Serviços RI.
// Sem innerHTML com dados: só nós de texto. Os textos vêm de data_institucional.json, fiéis às páginas oficiais;
// os números de prova vêm das mesmas funções puras que o resto da página (calculos.js, painel.js, institucional.js).
import * as C from "./calculos.js";
import * as P from "./painel.js";
import * as I from "./institucional.js";
import { fmtValor, fmtPct, nf, ND } from "./formatar.js";
import { desenharBarras } from "./graficos.js";

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
const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const semPonto = (t) => t.replace(/[;.]\s*$/, "");

function chipComp(comp, periodoBase, unidade) {
  if (!comp) return el("span", { class: "chip chip-neutro" }, `Sem base de comparação (${ND})`);
  if (comp.tipo === "abs") return el("span", { class: "chip chip-neutro" }, `diferença de ${fmtValor(comp.valor, unidade)} contra ${periodoBase}`);
  const sobe = comp.valor >= 0;
  const txt = comp.tipo === "pct" ? fmtPct(comp.valor, 1) : `${sobe ? "+" : "-"}${nf(Math.abs(comp.valor), 1)} p.p.`;
  return el("span", { class: `chip ${sobe ? "chip-bom" : "chip-atencao"}` }, el("span", { "aria-hidden": "true" }, sobe ? "▲ " : "▼ "), `${txt} contra ${periodoBase}`);
}

/** Cartão pequeno de número com rótulo, valor, comparação e fonte. */
function numeroProva(rotulo, valor, chips, fonte, extra) {
  return el("div", { class: "prova-item" },
    el("p", { class: "prova-item-rotulo" }, rotulo),
    el("p", { class: "prova-item-valor" }, valor),
    chips && chips.length ? el("p", { class: "prova-item-chips" }, chips) : null,
    extra || null,
    fonte ? el("p", { class: "prova-item-fonte" }, fonte) : null);
}

// ------------------------------------------------------------------ A Companhia

function iniciarPerfil({ di, ix }) {
  const cia = di.companhia, per = cia.perfil, f = cia.fatos;
  const anoBase = 2000 + Number(ix.tri[ix.tri.length - 1].slice(2));
  $("#cia-intro").textContent = per.abertura.join(" ");
  const fato = (valor, rotulo, nota) => el("article", { class: "fato" }, el("p", { class: "fato-valor" }, valor), el("p", { class: "fato-rotulo" }, rotulo), nota ? el("p", { class: "fato-nota" }, nota) : null);
  limpar($("#cia-fatos")).append(
    fato(`${anoBase - f.ano_origem} anos`, `de história, desde ${f.ano_origem}`, "Nossa História"),
    fato(`${f.ranking_sudeste}º e ${f.ranking_nacional}º`, "lugares nos rankings Regional Sudeste e Nacional", "Revista O Empreiteiro, segundo o Perfil Corporativo"),
    fato(`R$ ${f.preco_m2_min_mil} a ${f.preco_m2_max_mil} mil`, "por metro quadrado na marca Patrimar", "Perfil Corporativo"),
    fato(`${f.estados.length} estados`, f.estados.join(", "), "Nossa História"),
    fato(`${f.marcas.length} marcas`, f.marcas.join(" e "), "Perfil Corporativo"),
    fato(`${di.companhia.historia.edge.length} empreendimentos`, "com o selo EDGE de construção sustentável", "Nossa História"));
  const marcas = limpar($("#cia-marcas"));
  for (const m of per.marcas) {
    marcas.append(el("article", { class: "marca-cartao" },
      el("h4", {}, m.nome),
      el("p", { class: "marca-segmento" }, el("span", { class: "chip chip-neutro" }, m.segmento)),
      el("h5", {}, m.estrategia_titulo.replace(/;$/, "")),
      el("ul", { class: "lista-curta" }, m.estrategia.map((x) => el("li", {}, semPonto(x)))),
      el("p", { class: "marca-posicionamento" }, m.posicionamento),
      el("h5", {}, "Métodos construtivos"),
      el("ul", { class: "chips-lista" }, m.metodos.map((x) => el("li", {}, semPonto(x)))),
      el("details", {}, el("summary", {}, "Descrição oficial da marca"), el("p", {}, m.texto))));
  }
  marcas.append(el("p", { class: "nota marca-meta" }, per.meta, " ", el("span", {}, "Fonte: página Perfil Corporativo do site oficial.")));
  const filme = limpar($("#cia-filme"));
  filme.append(el("a", { class: "filme", href: di.meta.filme_url, target: "_blank", rel: "noopener noreferrer" },
    el("span", { class: "filme-play", "aria-hidden": "true" }),
    el("span", { class: "filme-texto" },
      el("strong", {}, "Filme institucional do Grupo Patrimar"),
      el("span", {}, "Abre no YouTube, em outra aba. O vídeo não é incorporado a esta página: ele continua no canal oficial da companhia.")),
    el("span", { class: "so-leitor" }, " (abre em nova aba)")));
}

function iniciarHistoria({ di }) {
  const h = di.companhia.historia;
  const botoes = $("#hist-eras");
  const lista = $("#hist-linha");
  let era = "todas";
  const desenhar = () => {
    limpar(lista);
    for (const a of I.marcosPorEra(h, era === "todas" ? null : era)) {
      lista.append(el("li", { class: "marco", "data-ano": String(a.ano) },
        el("div", { class: "marco-ano" }, el("span", { class: "marco-ano-num" }, String(a.ano)), el("span", { class: "chip chip-neutro" }, a.tag)),
        el("div", { class: "marco-texto" }, a.marcos.map((t) => el("p", {}, t)))));
    }
    for (const b of botoes.children) b.setAttribute("aria-pressed", String(b.dataset.era === era));
  };
  limpar(botoes);
  for (const [chave, rotulo] of [["todas", "Tudo"], ...I.ERAS.map((e) => [e.chave, `${e.rotulo} (${e.de} a ${e.ate})`])]) {
    botoes.append(el("button", { type: "button", class: "chip-botao", "data-era": chave, "aria-pressed": String(chave === "todas"), onclick: () => { era = chave; desenhar(); } }, rotulo));
  }
  desenhar();
  const caps = di.companhia.fatos.captacoes;
  const max = Math.max(...caps.map((c) => c.valor_milhoes));
  const total = I.totalCaptacoes(di.companhia.fatos);
  limpar($("#hist-captacoes")).append(
    el("p", { class: "nota" }, `Valores das emissões citadas no texto oficial: somam ${fmtValor(total, "BRL_MILHOES", { bi: 2 })}. É o valor emitido em cada operação, não o saldo da dívida; a 1ª emissão de debêntures foi liquidada, segundo o mesmo texto. O endividamento atual está no Índice de Solidez.`),
    el("ul", { class: "minibarras captacoes", "aria-label": "Emissões de dívida citadas na história, em R$ milhões" },
      caps.map((c) => el("li", {}, el("span", {}, `${c.ano}, ${c.instrumento}`), el("span", { class: "mb-trilho" }, el("span", { class: "mb-barra", style: `width:${(c.valor_milhoes / max) * 100}%` })), el("span", { class: "mb-valor" }, fmtValor(c.valor_milhoes, "BRL_MILHOES"))))));
}

function seloChip(a) {
  if (a.selo === "atencao") return el("span", { class: "chip chip-selo-atencao" }, "Pede leitura com cuidado");
  if (a.selo === "confortavel") return el("span", { class: "chip chip-selo-confortavel" }, "Dentro do histórico");
  return el("span", { class: "chip chip-neutro" }, "Histórico curto");
}

function provaTese(t, ctx, anoCheio) {
  const { ix } = ctx;
  const fonteAnual = (id) => P.fonteJanela(ix, id, P.acharJanela(ix, "ano", anoCheio));
  switch (t.chave) {
    case "lideranca":
      return el("div", { class: "prova-grade" }, t.fatos.map((x) => numeroProva(`${x.rotulo}, ${x.periodo}`, fmtValor(x.valor, x.unidade, { bi: 2 }), [chipComp(x.comp, x.periodoBase, x.unidade)], `Fonte: ${fonteAnual(x.id)}.`)));
    case "regional": {
      if (!t.mg) return el("p", { class: "nota" }, "Sem leitura por região para o último ano completo.");
      const l = t.mg.lancamentos, v = t.mg.vendas;
      return el("div", { class: "prova-grade" },
        l ? numeroProva(`Lançamentos em Minas Gerais, ${t.mg.rotulo}`, `${nf(l.pct, 1)}%`, [el("span", { class: "chip chip-neutro" }, `${fmtValor(l.mg, "BRL_MILHOES")} de ${fmtValor(l.total, "BRL_MILHOES")}`)], `Fonte: ${l.documento}, p. ${l.pagina}. Os outros ${nf(100 - l.pct, 1)}% são de Rio de Janeiro e São Paulo.`) : null,
        v ? numeroProva(`Vendas em Minas Gerais, ${t.mg.rotulo}`, `${nf(v.pct, 1)}%`, [el("span", { class: "chip chip-neutro" }, `${fmtValor(v.mg, "BRL_MILHOES")} de ${fmtValor(v.total, "BRL_MILHOES")}`)], `Fonte: ${v.documento}, p. ${v.pagina}.`) : null);
    }
    case "landbank": {
      const l = t.terreno.landbank;
      return el("div", { class: "prova-grade" },
        numeroProva(`Landbank em VGV, ${l.periodo}`, fmtValor(l.valor, "BRL_MILHOES", { bi: 1 }), [l.recorde ? el("span", { class: "chip chip-recorde" }, `Recorde da série (desde ${l.recordeDesde})`) : null, l.variacaoPct === null ? null : chipComp({ tipo: "pct", valor: l.variacaoPct }, l.comparacao.periodo, "BRL_MILHOES")], "Fonte: planilha oficial, linha 21."),
        numeroProva("Cobertura no ritmo dos últimos 12 meses", fmtValor(t.terreno.cobertura, "anos"), [], null, el("p", { class: "prova-item-fonte" }, "Cálculo GSA: landbank ÷ lançamentos de 12 meses. ", el("a", { href: "#cobertura" }, "Mover o ritmo no simulador"))));
    }
    case "estrutura": {
      const itens = [t.alavancagem, t.liquidez, t.caixaOp];
      const atencao = itens.filter((x) => x.selo === "atencao").length;
      const unid = { "%": "%", x: "x", BRL_MILHOES: "BRL_MILHOES" };
      return el("div", {},
        el("div", { class: "prova-grade" }, itens.map((a) => numeroProva(`${a.nome.replace(/ \(.*\)/, "")}, ${a.atual.periodo}`, fmtValor(a.atual.valor, unid[a.unidade], { bi: 1 }), [seloChip(a)], `Fonte: ${a.formula.split(".")[0]}.`))),
        el("p", { class: "prova-contrapeso" }, el("strong", {}, "Contrapeso: "),
          atencao > 0 ? `${atencao} de 3 medidas estão em faixa de atenção contra a própria história da Patrimar. ` : "Nenhuma das 3 medidas está em faixa de atenção contra a própria história da Patrimar. ",
          `O patrimônio líquido do ${t.patrimonio.periodo} é de ${fmtValor(t.patrimonio.valor, "BRL_MILHOES")}. `, el("a", { href: "#indice" }, "Ver o Índice de Solidez com as fórmulas")));
    }
    case "resultados":
      return el("div", { class: "prova-grade" }, t.fatos.map((x) => numeroProva(`${x.rotulo.replace(/ \(contábil\)/, "")}, ${x.periodo}`, fmtValor(x.valor, x.unidade, { bi: 2 }), [chipComp(x.comp, x.periodoBase, x.unidade)], `Fonte: ${fonteAnual(x.id)}.`)));
    default:
      return null;
  }
}

function iniciarTeses(ctx) {
  const { di, ix, an, dp } = ctx;
  const tese = di.companhia.teses;
  const prov = I.provasDasTeses(ix, an, dp);
  $("#teses-guarda").textContent = tese.guarda_chuva;
  $("#teses-intro").textContent = `Abaixo, as quatro teses que a Patrimar publica em Por que investir e o ponto sobre resultados. Ao lado de cada uma, os números da base auditada deste site: o que confirma e o que pede leitura com cuidado. Os valores anuais são os de ${prov.anoCheio}, o último ano completo.`;
  const alvo = limpar($("#teses-corpo"));
  const titulos = [...tese.pilares, tese.bloco_pontos[tese.indice_resultados]];
  titulos.forEach((titulo, i) => {
    const t = prov.teses[i];
    alvo.append(el("article", { class: "tese", "data-tese": t.chave },
      el("p", { class: "tese-n", "aria-hidden": "true" }, String(i + 1)),
      el("h3", {}, titulo),
      provaTese(t, ctx, prov.anoCheio)));
  });
  $("#teses-bloco-titulo").textContent = tese.bloco_titulo;
  limpar($("#teses-detalhes")).append(...tese.bloco_pontos.filter((_, k) => k !== tese.indice_resultados).map((x) => el("li", {}, x)));
}

function iniciarSustentabilidade({ di }) {
  const cia = di.companhia, s = cia.sustentabilidade, pr = cia.premios;
  $("#sus-intro").textContent = s.introducao;
  const premios = limpar($("#sus-premios"));
  for (const p of pr.itens) {
    premios.append(el("article", { class: "premio" },
      el("p", { class: "premio-ano" }, p.ano),
      el("h4", {}, p.veiculo),
      el("p", { class: "premio-titulo" }, p.titulo),
      el("p", {}, p.texto)));
  }
  premios.append(el("article", { class: "premio premio-edge" },
    el("p", { class: "premio-ano" }, "2023 e 2024"),
    el("h4", {}, "Selo EDGE"),
    el("p", { class: "premio-titulo" }, `${cia.historia.edge.length} empreendimentos certificados`),
    el("ul", { class: "chips-lista" }, cia.historia.edge.map((e) => el("li", {}, `${e.nome} (${e.ano})`))),
    el("p", { class: "nota" }, "Fonte: Nossa História.")));
  const grupos = I.gruposSustentabilidade(s);
  const botoes = limpar($("#sus-grupos"));
  const lista = $("#sus-melhorias");
  let grupo = "todas";
  const desenhar = () => {
    limpar(lista);
    for (const m of s.melhorias) {
      if (grupo !== "todas" && m.grupo !== grupo) continue;
      lista.append(el("li", { class: "melhoria", "data-grupo": m.grupo }, el("h4", {}, m.titulo), el("p", {}, m.texto), el("p", { class: "melhoria-grupo" }, m.grupo + (m.titulo_gsa ? " · título da GSA" : ""))));
    }
    for (const b of botoes.children) b.setAttribute("aria-pressed", String(b.dataset.grupo === grupo));
  };
  for (const [chave, rotulo] of [["todas", `Todas (${s.melhorias.length})`], ...grupos.map((g) => [g.grupo, `${g.grupo} (${g.total})`])]) {
    botoes.append(el("button", { type: "button", class: "chip-botao", "data-grupo": chave, "aria-pressed": String(chave === "todas"), onclick: () => { grupo = chave; desenhar(); } }, rotulo));
  }
  desenhar();
  const social = limpar($("#sus-social"));
  social.append(el("article", { class: "social social-residuos" }, el("h4", {}, s.gestao_residuos.titulo), el("p", {}, s.gestao_residuos.texto)));
  for (const x of s.social) social.append(el("article", { class: "social" }, el("h4", {}, x.titulo), el("p", {}, x.texto)));
  limpar($("#sus-relatorios")).append(...s.relatorios.map((r) => el("li", {}, externo(r.url, `Relatório de Sustentabilidade ${r.ano}`))));
}

// ------------------------------------------------------------------ Governança

function barraPar(p, max) {
  const barra = (v, classe) => el("span", { class: "par-trilho" }, v === null ? null : el("span", { class: `par-barra ${classe}`, style: `width:${(v / max) * 100}%` }));
  return el("li", { class: "par" },
    el("span", { class: "par-nome" }, p.nome, el("small", {}, p.cargo)),
    el("span", { class: "par-barras" },
      el("span", { class: "par-linha" }, barra(p.patrimar, "par-patrimar"), el("span", { class: "par-valor" }, p.patrimar === null ? ND : `${p.patrimar} na Patrimar`)),
      el("span", { class: "par-linha" }, barra(p.mercado, "par-mercado"), el("span", { class: "par-valor" }, p.mercado === null ? ND : `${p.mercado} no mercado`))));
}

function cartaoPessoa(p) {
  return el("article", { class: "pessoa", "data-pessoa": p.chave },
    el("h4", {}, p.nome),
    el("p", { class: "pessoa-cargo" }, p.cargo),
    p.anos_patrimar !== null || p.anos_mercado !== null ? el("p", { class: "pessoa-anos" },
      el("span", { class: "chip chip-neutro" }, `Patrimar: ${p.anos_patrimar === null ? ND : `${p.anos_patrimar} anos`}`),
      el("span", { class: "chip chip-neutro" }, `Mercado: ${p.anos_mercado === null ? ND : `${p.anos_mercado} anos`}`)) : null,
    p.curriculo ? el("details", {}, el("summary", {}, "Minicurrículo"), el("p", {}, p.curriculo)) : null);
}

function iniciarGovernanca({ di }) {
  const g = di.governanca;
  const r = I.resumoGovernanca(g);
  const m = I.matrizCadeiras(g);
  $("#gov-intro").textContent = `O controle é de um único acionista, a PRMV Participações Ltda. Por isso importa ver quem se senta no conselho, quem coordena cada comitê e quais cadeiras se repetem entre as mesmas pessoas. São ${m.pessoasUnicas} pessoas em ${m.cadeirasTotal} cadeiras.`;
  const kpi = (rot, val, nota) => el("article", { class: "kpi-gov" }, el("h3", { class: "kpi-rotulo" }, rot), el("p", { class: "kpi-valor" }, val), nota ? el("p", { class: "kpi-fonte" }, nota) : null);
  limpar($("#gov-resumo")).append(
    kpi("Conselheiros", String(r.conselho), `${r.independentes} independentes (${nf(r.pctIndependentes, 0)}%)`),
    kpi("Diretores", String(r.diretores), `Mediana de ${nf(r.medianaAnosPatrimar, 1)} anos de Patrimar`),
    kpi("Comitês", String(r.comites), `${r.membrosComites} cadeiras nos comitês`),
    kpi("Pessoas diferentes", String(m.pessoasUnicas), `em ${m.cadeirasTotal} cadeiras no total`));
  const c = g.composicao;
  limpar($("#gov-composicao")).append(el("div", { class: "composicao" },
    el("div", { class: "composicao-barra", role: "img", "aria-label": `${c.acionista} detém ${nf(c.percentual, 0)}% das ações` }, el("span", { class: "composicao-fatia", style: `width:${c.percentual}%` }, `${c.acionista} ${nf(c.percentual, 0)}%`)),
    el("ul", { class: "composicao-lista" },
      el("li", {}, el("strong", {}, `${nf(c.total_acoes, 0)} ações ordinárias`), `, nenhuma preferencial`),
      el("li", {}, `Ações em tesouraria: ${nf(c.tesouraria, 0)}. Outros acionistas: ${nf(c.outros, 0)}.`),
      el("li", {}, `Última alteração registrada: ${c.ultima_alteracao}.`),
      el("li", {}, `Pessoa física por trás da PRMV, segundo o formulário: ${c.pessoa_fisica_titular}.`)),
    el("p", { class: "nota" }, `${c.nota} Fonte: ${c.documento}, p. ${c.paginas[0]} a ${c.paginas[c.paginas.length - 1]}.`)));
  const anos = I.anosDiretoria(g);
  const max = Math.max(...anos.map((a) => Math.max(a.patrimar ?? 0, a.mercado ?? 0)));
  limpar($("#gov-anos")).append(
    el("p", { class: "nota" }, "Anos de casa e anos de mercado de cada diretor, como a página oficial informa. A barra verde é o tempo na Patrimar; a cinza, o tempo de mercado."),
    el("ul", { class: "pares", "aria-label": "Anos na Patrimar e anos de mercado, por diretor" }, anos.map((a) => barraPar(a, max))));
  limpar($("#gov-diretoria")).append(...g.diretoria.map(cartaoPessoa));
  limpar($("#gov-conselho")).append(...g.conselho.map(cartaoPessoa));
  limpar($("#gov-comites")).append(...g.comites.map((cm) => el("article", { class: "comite" },
    el("h4", {}, cm.nome),
    el("ul", {}, cm.membros.map((p) => el("li", {}, el("span", {}, p.nome), el("span", { class: /Coordenador/.test(p.cargo) ? "chip chip-selo-confortavel" : "chip chip-neutro" }, p.cargo.replace("Membro do Comitê", "Membro").replace(" (Efetivo)", ""))))))));
  $("#gov-cadeiras-nota").textContent = "Cada linha é uma pessoa; cada coluna, um órgão. Marcações repetidas mostram onde as mesmas pessoas decidem em vários lugares. É leitura de estrutura, sem juízo sobre as pessoas.";
  const cab = limpar($("#gov-tabela-cadeiras thead"));
  cab.append(el("tr", {}, el("th", { scope: "col" }, "Pessoa"), ...m.orgaos.map((o) => el("th", { scope: "col", class: "centro" }, o)), el("th", { scope: "col", class: "num" }, "Cadeiras")));
  const corpo = limpar($("#gov-tabela-cadeiras tbody"));
  for (const p of m.pessoas) {
    corpo.append(el("tr", { "data-pessoa": p.chave }, el("th", { scope: "row" }, p.nome),
      ...m.orgaos.map((o) => {
        const cargo = p.cadeiras[o];
        return el("td", { class: "centro", "data-orgao": o }, cargo ? el("span", { class: /Coordenador|Presidente/.test(cargo) ? "marca-coord" : "marca-membro", title: cargo }, /Coordenador|Presidente/.test(cargo) ? "C" : "●", el("span", { class: "so-leitor" }, ` ${cargo}`)) : el("span", { class: "so-leitor" }, "sem assento"));
      }),
      el("td", { class: "num" }, String(p.total))));
  }
  $("#gov-divergencias").textContent = g.divergencias.length
    ? `Diferenças dentro da própria página oficial: ${g.divergencias.map((d) => `${d.pessoa} aparece com ${d.valores.map((v) => `${v.valor} (${v.orgao})`).join(" e ")} em ${d.campo}`).join("; ")}. Os cartões usam o valor da primeira tabela em que a pessoa aparece.`
    : "";
  desenharDocumentos(g);
}

function desenharDocumentos(g) {
  const alvo = limpar($("#gov-documentos"));
  for (const grupo of I.documentosPorGrupo(g)) {
    if (!grupo.itens.length) continue;
    const corpo = el("div", {});
    const lista = el("ul", { class: "lista-docs-gov" });
    let cat = "todas";
    const desenhar = () => {
      limpar(lista);
      for (const d of grupo.itens) {
        if (cat !== "todas" && d.categoria !== cat) continue;
        lista.append(el("li", {}, el("span", { class: "doc-data" }, d.data), externo(d.url, d.titulo), d.categoria && grupo.chave === "cvm" ? el("span", { class: "chip chip-neutro" }, d.categoria) : null));
      }
    };
    if (grupo.chave === "cvm") {
      const cats = I.categoriasCvm(grupo.itens);
      const bot = el("div", { class: "chips-filtro", role: "group", "aria-label": "Categoria dos documentos entregues à CVM" });
      for (const [chave, rotulo] of [["todas", `Todas (${grupo.itens.length})`], ...cats.map((c) => [c.categoria, `${c.categoria} (${c.total})`])]) {
        bot.append(el("button", { type: "button", class: "chip-botao", "data-categoria": chave, "aria-pressed": String(chave === "todas"), onclick: () => { cat = chave; desenhar(); for (const b of bot.children) b.setAttribute("aria-pressed", String(b.dataset.categoria === cat)); } }, rotulo));
      }
      corpo.append(bot);
    }
    corpo.append(lista);
    desenhar();
    alvo.append(el("details", { class: "grupo-docs", open: grupo.chave === "estatuto" || grupo.chave === "politicas" }, el("summary", {}, `${grupo.titulo} (${grupo.itens.length})`), corpo));
  }
  alvo.append(el("p", { class: "nota" }, "Os arquivos ficam no site oficial de RI, que os entrega em PDF. Esta página só organiza a lista."));
}

// ------------------------------------------------------------------ Serviços RI

function desenharRitmo(ritmo) {
  const alvoR = $("#srv-ritmo-resultado"), alvoP = $("#srv-ritmo-previa");
  const L = (a) => Math.max(240, Math.floor(a.clientWidth || 560));
  const serie = (campo) => ritmo.trimestres.filter((x) => x[campo] !== null).map((x) => ({ chave: x.ref, rotulo: x.ref, valor: x[campo], selecionada: x.anual }));
  desenharBarras(alvoR, serie("resultado"), { descricao: "Dias entre o fim do trimestre e a divulgação do resultado, por trimestre", largura: L(alvoR), altura: 230, formatar: (v) => `${nf(v, 0)} d` });
  desenharBarras(alvoP, serie("previa"), { descricao: "Dias entre o fim do trimestre e a divulgação da prévia operacional, por trimestre", largura: L(alvoP), altura: 230, formatar: (v) => `${nf(v, 0)} d` });
}

function iniciarServicos({ di }) {
  const s = di.servicos, cal = s.calendario;
  const hoje = I.hojeISO();
  const dest = I.eventoEmDestaque(cal, hoje);
  const ev = dest.evento;
  limpar($("#srv-destaque")).append(el("article", { class: `destaque-evento ${dest.situacao}` },
    el("p", { class: "destaque-rotulo" }, dest.situacao === "futuro" ? "Próximo evento" : "Último evento do calendário oficial"),
    el("p", { class: "destaque-data" }, dataBR(ev.data)),
    el("h3", {}, ev.titulo),
    el("p", {}, dest.situacao === "futuro"
      ? `Faltam ${dest.dias} dias. Horário: ${ev.horario.toLowerCase()}.`
      : `A data prevista passou há ${-dest.dias} dias. Os números do 3T26 já estão na Central deste site. Horário previsto: ${ev.horario.toLowerCase()}.`),
    el("p", { class: "nota" }, cal.nota_proximo)));

  const ritmo = I.ritmoDivulgacao(cal);
  $("#srv-ritmo-texto").textContent = `Nos últimos 8 trimestres comuns, o resultado saiu entre ${ritmo.minResultado8} e ${ritmo.maxResultado8} dias depois do fim do trimestre (mediana de ${nf(ritmo.medianaResultado8, 1)}). A prévia operacional sai mais cedo: mediana de ${nf(ritmo.medianaPrevia, 1)} dias, em ${ritmo.nPrevias} divulgações. As barras do 4T (em destaque) levam o balanço anual e demoram mais, com mediana de ${nf(ritmo.medianaAnual, 1)} dias. O maior atraso da série foi o ${ritmo.maiorAtraso.ref}, com ${ritmo.maiorAtraso.resultado} dias. Cálculo GSA, a partir das datas do calendário oficial.`;
  desenharRitmo(ritmo);
  let timer = null;
  window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(() => desenharRitmo(ritmo), 150); });

  const anos = I.anosDoCalendario(cal);
  const botoes = limpar($("#srv-anos"));
  const sel = limpar($("#srv-tipo"));
  let ano = anos[0], tipo = "todos";
  const tipos = [["todos", "Todos os tipos"], ["resultado", "Resultados"], ["previa", "Prévias operacionais"], ["assembleia", "Assembleias"], ["formularios", "Formulários"], ["governanca", "Governança"]];
  for (const [v, t] of tipos) sel.append(el("option", { value: v }, t));
  const desenhar = () => {
    const lista = limpar($("#srv-eventos"));
    const itens = I.eventosDoAno(cal, ano, tipo);
    if (!itens.length) lista.append(el("li", { class: "vazio" }, "Nenhum evento deste tipo neste ano."));
    for (const e of itens) {
      const passou = e.data < hoje;
      lista.append(el("li", { class: "evento", "data-data": e.data, "data-tipo": e.tipo },
        el("span", { class: "evento-data" }, dataBR(e.data)),
        el("span", { class: "evento-titulo" }, e.titulo),
        el("span", { class: "chip chip-neutro" }, I.TIPOS_EVENTO[e.tipo]),
        e.dias_apos_fim !== null ? el("span", { class: "evento-dias" }, `${e.dias_apos_fim} dias após o fim do período`) : null,
        !passou ? el("span", { class: "chip chip-bom" }, "previsto") : null));
    }
    for (const b of botoes.children) b.setAttribute("aria-pressed", String(b.dataset.ano === ano));
  };
  for (const a of anos) botoes.append(el("button", { type: "button", class: "chip-botao", "data-ano": a, "aria-pressed": String(a === ano), onclick: () => { ano = a; desenhar(); } }, a));
  sel.addEventListener("change", () => { tipo = sel.value; desenhar(); });
  desenhar();

  const c = s.contatos;
  limpar($("#srv-contato")).append(
    el("article", { class: "contato" },
      el("h4", {}, c.responsavel), el("p", { class: "pessoa-cargo" }, c.cargo),
      el("p", {}, el("span", { class: "rotulo-contato" }, "Telefone"), " ", c.telefone),
      el("p", {}, el("span", { class: "rotulo-contato" }, "E-mail"), " ", el("a", { href: `mailto:${c.email}` }, c.email)),
      el("p", {}, c.endereco, el("br"), c.cidade),
      el("p", { class: "nota" }, `Fonte: página ${c.pagina} do site oficial. O rodapé do site traz também a equipe de RI: ${c.rodape_equipe}.`)),
    el("article", { class: "contato" },
      el("h4", {}, "Canais do site oficial"),
      el("p", { class: "nota" }, "O formulário Fale com RI, o cadastro de Alertas RI e as cotações ficam no site oficial. Esta página não coleta dados de ninguém."),
      el("ul", { class: "lista-links" },
        el("li", {}, externo("https://ri.patrimar.com.br/", "Site oficial de RI")),
        ...di.__navegacao.map((n) => el("li", {}, externo(n.url, n.titulo))))));
  const inf = s.informe;
  limpar($("#srv-informe")).append(el("div", { class: "informe" },
    el("ol", { class: "passos" },
      el("li", {}, el("strong", {}, "Em qualquer agência do Banco Itaú"), ", que é o banco custodiante das ações da Patrimar: basta pedir o informe."),
      el("li", {}, el("strong", {}, "Correntistas do Itaú Unibanco"), ": o informe sai no site do banco, no menu Conta Corrente, Declaração do Imposto de Renda, Informe de Rendimento."),
      el("li", {}, el("strong", {}, "Não correntistas"), ": é preciso se cadastrar no Portal de Correspondências Digitais para acessar o informe.")),
    el("p", {}, "O Itaú envia o informe todo ano ao endereço cadastrado de cada acionista; confira se o endereço está correto e se os cadastros da conta corrente e escritural estão atualizados."),
    el("p", { class: "nota" }, `Resumo da página ${inf.pagina} do site oficial.`)));
}

export function iniciarInstitucional(ctx) {
  const di = ctx.di;
  di.__navegacao = (ctx.ds.navegacao || []).filter((n) => ["Alertas RI", "Fale com RI"].includes(n.titulo));
  iniciarPerfil(ctx);
  iniciarHistoria(ctx);
  iniciarTeses(ctx);
  iniciarSustentabilidade(ctx);
  iniciarGovernanca(ctx);
  iniciarServicos(ctx);
}
