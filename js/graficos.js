// Gráficos em SVG próprio, sem biblioteca: o skyline exige desenho sob medida (prédio = trimestre,
// altura = valor, última torre em destaque). Cores e fontes vêm de variáveis CSS, então os dois temas funcionam.
// A geometria é pura e testada no Node; o desenho usa só createElementNS (sem innerHTML).

const NS = "http://www.w3.org/2000/svg";

/**
 * Geometria do skyline: uma torre por ponto da série, altura proporcional ao valor a partir de ZERO
 * (sem truncar o eixo). Devolve [{periodo, valor, x, y, w, h}].
 */
export function geometriaSkyline(serie, largura, altura, { margemX = 6, topo = 60, base = 30 } = {}) {
  const n = serie.length;
  const folga = Math.max(2, largura * 0.005);
  const w = (largura - 2 * margemX - folga * (n - 1)) / n;
  const hmax = altura - topo - base;
  const max = Math.max(...serie.map((s) => s.valor));
  const chao = altura - base;
  return serie.map((s, i) => {
    const h = (s.valor / max) * hmax;
    return { periodo: s.periodo, valor: s.valor, x: margemX + i * (w + folga), y: chao - h, w, h };
  });
}

/** Altura do desenho para uma largura de contêiner: proporção de horizonte, com limites para o celular. */
export function alturaSkyline(largura) {
  return Math.max(250, Math.min(440, Math.round(largura * 0.34)));
}

function svg(tag, attrs = {}, ...filhos) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
  for (const f of filhos.flat()) if (f !== null && f !== undefined) n.append(f.nodeType ? f : document.createTextNode(String(f)));
  return n;
}

function padraoJanelas(id, classe) {
  return svg("pattern", { id, width: 7, height: 10, patternUnits: "userSpaceOnUse" },
    svg("rect", { x: 1.5, y: 2.5, width: 3, height: 4, class: classe }));
}

/**
 * Desenha o skyline dentro de "alvo". Opções:
 *   rotuloValor(v)  texto do valor ("R$ 18,3 bi")
 *   descricao       texto para leitores de tela (também vira <title>)
 *   selo            texto sobre a última torre ("Recorde da série"), ou null
 *   animar          crescimento curto das torres (a folha de estilo o desliga com movimento reduzido)
 *   largura         largura em pixels
 */
export function desenharSkyline(alvo, serie, { rotuloValor, descricao, selo = null, animar = false, largura }) {
  const W = Math.max(300, Math.round(largura));
  const H = alturaSkyline(W);
  const torres = geometriaSkyline(serie, W, H);
  const chao = H - 30;
  const n = torres.length;
  const ultima = torres[n - 1];

  const raiz = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-labelledby": "sk-titulo sk-desc", class: `skyline-svg${animar ? " animar" : ""}` },
    svg("title", { id: "sk-titulo" }, "Landbank por trimestre"),
    svg("desc", { id: "sk-desc" }, descricao),
    svg("defs", {}, padraoJanelas("sk-jan", "sk-janela"), padraoJanelas("sk-jan-d", "sk-janela-d")));

  // Nível do valor mais recente: linha tracejada até a última torre.
  raiz.append(svg("line", { x1: 4, x2: ultima.x + ultima.w, y1: ultima.y, y2: ultima.y, class: "sk-nivel" }));

  torres.forEach((t, i) => {
    const destaque = i === n - 1;
    const g = svg("g", { class: "sk-cresce", style: `--atraso:${i * 26}ms` },
      svg("rect", { x: t.x, y: t.y, width: t.w, height: t.h, class: destaque ? "sk-torre sk-torre-destaque" : "sk-torre", "data-periodo": t.periodo, "data-valor": Math.round(t.valor * 1000) / 1000, "data-recorde": destaque && selo ? "true" : null },
        svg("title", {}, `${t.periodo}: ${rotuloValor(t.valor)}`)),
      svg("rect", { x: t.x, y: t.y, width: t.w, height: t.h, fill: `url(#${destaque ? "sk-jan-d" : "sk-jan"})`, class: "sk-vidros", "aria-hidden": "true" }));
    raiz.append(g);
  });

  // Chão.
  raiz.append(svg("line", { x1: 0, x2: W, y1: chao, y2: chao, class: "sk-chao" }));

  // Eixo: um rótulo a cada 4 trimestres (um por ano, no 4T) e o último.
  torres.forEach((t, i) => {
    const mostrar = i % 4 === 0 || i === n - 1;
    // Rótulo vizinho do último só aparece se houver espaço: cerca de 56 px entre os centros.
    const perto = i !== n - 1 && (n - 1 - i) * (t.w + (torres[1].x - torres[0].x - t.w)) < 56;
    if (!mostrar || perto) return;
    raiz.append(svg("text", { x: t.x + t.w / 2, y: H - 9, class: "sk-eixo", "text-anchor": i === n - 1 ? "end" : i === 0 ? "start" : "middle" }, t.periodo));
  });

  // Valores: primeira e última torre; selo sobre a última.
  const primeira = torres[0];
  raiz.append(svg("text", { x: primeira.x, y: primeira.y - 9, class: "sk-valor", "text-anchor": "start" }, rotuloValor(primeira.valor)));
  raiz.append(svg("text", { x: ultima.x + ultima.w, y: ultima.y - 9, class: "sk-valor sk-valor-destaque", "text-anchor": "end" }, rotuloValor(ultima.valor)));
  if (selo) raiz.append(svg("text", { x: ultima.x + ultima.w, y: ultima.y - 29, class: "sk-selo", "text-anchor": "end" }, selo));

  // Tabela para leitores de tela (o desenho é decorativo para quem não enxerga).
  // A tabela fica dentro de um contêiner recortado: sozinha, ela herdaria a largura mínima das tabelas e
  // esticaria a área rolável da página no celular.
  const oculto = document.createElement("div");
  oculto.className = "so-leitor";
  const tabela = document.createElement("table");
  const cap = document.createElement("caption");
  cap.textContent = "Landbank em VGV, em R$ milhões, por trimestre";
  tabela.append(cap);
  const corpo = document.createElement("tbody");
  for (const t of torres) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = t.periodo;
    const td = document.createElement("td");
    td.textContent = rotuloValor(t.valor);
    tr.append(th, td);
    corpo.append(tr);
  }
  tabela.append(corpo);
  oculto.append(tabela);

  alvo.replaceChildren(raiz, oculto);
  return { largura: W, altura: H, torres };
}

// ---------------------------------------------------------------- miniatura de série (Índice de Solidez)

/**
 * Geometria da miniatura: linha da série, linha tracejada da média histórica e o ponto atual. Lacunas (null) quebram
 * a linha em segmentos: nunca se liga, interpola nem desenha zero onde falta dado.
 */
export function geometriaSparkline(serie, largura, altura, { media = null, pad = 6 } = {}) {
  const com = serie.filter((x) => x.valor !== null);
  const refs = media === null ? com.map((x) => x.valor) : [...com.map((x) => x.valor), media];
  const min = Math.min(...refs);
  const max = Math.max(...refs);
  const faixa = max - min || 1;
  const n = serie.length;
  const X = (i) => pad + (i / Math.max(1, n - 1)) * (largura - 2 * pad);
  const Y = (val) => altura - pad - ((val - min) / faixa) * (altura - 2 * pad);
  const pontos = serie.map((x, i) => (x.valor === null ? null : { periodo: x.periodo, valor: x.valor, x: X(i), y: Y(x.valor) }));
  const segmentos = [];
  let atual = [];
  for (const p of pontos) {
    if (p === null) {
      if (atual.length) segmentos.push(atual);
      atual = [];
    } else atual.push(p);
  }
  if (atual.length) segmentos.push(atual);
  const ultimo = [...pontos].reverse().find((p) => p !== null) ?? null;
  return { pontos, segmentos, ultimo, yMedia: media === null ? null : Y(media), min, max };
}

export function desenharSparkline(alvo, serie, { media = null, descricao, largura, altura = 70 }) {
  const L = Math.max(120, Math.round(largura));
  const geo = geometriaSparkline(serie, L, altura, { media });
  const caminho = geo.segmentos.map((seg) => seg.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")).join(" ");
  const raiz = svg("svg", { viewBox: `0 0 ${L} ${altura}`, width: L, height: altura, role: "img", class: "spark-svg", "aria-label": descricao },
    svg("title", {}, descricao));
  if (geo.yMedia !== null) raiz.append(svg("line", { x1: 0, x2: L, y1: geo.yMedia, y2: geo.yMedia, class: "spark-media" }));
  raiz.append(svg("path", { d: caminho, class: "spark-linha", fill: "none" }));
  if (geo.ultimo) raiz.append(svg("circle", { cx: geo.ultimo.x, cy: geo.ultimo.y, r: 4.5, class: "spark-ponto", "data-periodo": geo.ultimo.periodo, "data-valor": Math.round(geo.ultimo.valor * 1e6) / 1e6 }));
  alvo.replaceChildren(raiz);
  return geo;
}

// ---------------------------------------------------------------- explorador de séries (linhas, eixo duplo, marcas, eventos)

/**
 * Escala com graduações "redondas" (1, 2, 5 vezes uma potência de 10). Se todos os valores têm o mesmo sinal,
 * o zero entra na escala: linha sem zero engana a leitura da magnitude.
 */
export function escalaBonita(min, max, alvo = 5) {
  let lo = Math.min(min, 0);
  let hi = Math.max(max, 0);
  if (hi === lo) hi = lo + 1;
  const bruto = (hi - lo) / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / mag;
  const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  lo = Math.floor(lo / passo + 1e-9) * passo + 0; // "+ 0" evita -0, que viraria "-0" no rótulo do eixo
  hi = Math.ceil(hi / passo - 1e-9) * passo + 0;
  const ticks = [];
  for (let t = lo; t <= hi + passo / 2; t += passo) ticks.push(Math.round(t / passo) * passo + 0);
  return { min: lo, max: hi, passo, ticks };
}

export function alturaExplorador(largura) {
  return Math.max(320, Math.min(460, Math.round(largura * 0.42)));
}

/**
 * Geometria do explorador. series: [{valores, eixo: "esq" | "dir"}]. Cada eixo tem a sua escala, calculada só
 * com as séries que o usam. Lacunas (null) quebram a linha em segmentos: nunca se liga nem se interpola.
 */
export function geometriaExplorador(series, periodos, largura, altura) {
  const temDir = series.some((s) => s.eixo === "dir");
  const m = { e: 64, d: temDir ? 64 : 16, t: 40, b: 36 };
  const area = { x0: m.e, x1: largura - m.d, y0: m.t, y1: altura - m.b };
  const escalas = {};
  for (const lado of ["esq", "dir"]) {
    const vs = series.filter((s) => s.eixo === lado).flatMap((s) => s.valores.filter((v) => v !== null && v !== undefined));
    escalas[lado] = vs.length ? escalaBonita(Math.min(...vs), Math.max(...vs)) : null;
  }
  const n = periodos.length;
  const pad = 10;
  const X = (i) => (n === 1 ? (area.x0 + area.x1) / 2 : area.x0 + pad + (i * (area.x1 - area.x0 - 2 * pad)) / (n - 1));
  const Y = (lado, v) => {
    const e = escalas[lado];
    return area.y1 - ((v - e.min) / (e.max - e.min)) * (area.y1 - area.y0);
  };
  const saida = series.map((s) => {
    const pontos = s.valores.map((v, i) => (v === null || v === undefined ? null : { i, periodo: periodos[i], valor: v, x: X(i), y: Y(s.eixo, v) }));
    const segmentos = [];
    let atual = [];
    for (const p of pontos) {
      if (p === null) {
        if (atual.length) segmentos.push(atual);
        atual = [];
      } else atual.push(p);
    }
    if (atual.length) segmentos.push(atual);
    return { pontos, segmentos };
  });
  return { area, escalas, series: saida, x: X, y: Y, temDir };
}

/**
 * Desenha o explorador em "alvo". cfg:
 *   largura, descricao, periodos, rotulosX (booleano por período),
 *   series: [{chave: "A"|"B", valores, eixo, rotulo, fmt(v), marcas: {recorde, minimo}}],
 *   fmtEixo: {esq(v), dir(v)}, eventos: [{indice, numero, titulo}]
 */
export function desenharExplorador(alvo, cfg) {
  const W = Math.max(300, Math.round(cfg.largura));
  const H = alturaExplorador(W);
  const geo = geometriaExplorador(cfg.series, cfg.periodos, W, H);
  const { area } = geo;
  const raiz = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-labelledby": "ex-titulo ex-desc", class: "ex-svg" },
    svg("title", { id: "ex-titulo" }, "Gráfico de linhas dos indicadores escolhidos no explorador"), svg("desc", { id: "ex-desc" }, cfg.descricao));

  // Grade e graduações do eixo esquerdo (e do direito, se houver).
  const esq = geo.escalas.esq;
  if (esq) {
    for (const t of esq.ticks) {
      const y = geo.y("esq", t);
      raiz.append(svg("line", { x1: area.x0, x2: area.x1, y1: y, y2: y, class: t === 0 ? "ex-zero" : "ex-grade" }));
      raiz.append(svg("text", { x: area.x0 - 8, y: y + 4, class: "ex-tick", "text-anchor": "end" }, cfg.fmtEixo.esq(t, esq.passo)));
    }
  }
  const dir = geo.escalas.dir;
  if (dir) {
    for (const t of dir.ticks) {
      const y = geo.y("dir", t);
      raiz.append(svg("text", { x: area.x1 + 8, y: y + 4, class: "ex-tick ex-tick-dir", "text-anchor": "start" }, cfg.fmtEixo.dir(t, dir.passo)));
      raiz.append(svg("line", { x1: area.x1, x2: area.x1 + 4, y1: y, y2: y, class: "ex-grade-dir" }));
    }
  }

  // Eventos: linha vertical e marcador numerado no topo (marcadores do mesmo período se deslocam para o lado).
  const jaUsados = {};
  for (const e of cfg.eventos ?? []) {
    const x = geo.x(e.indice);
    const k = jaUsados[e.indice] ?? 0;
    jaUsados[e.indice] = k + 1;
    // Marcadores do mesmo período se afastam 21 px; perto da borda direita, para dentro do gráfico.
    const gx = x > area.x1 - 30 ? x - k * 21 : x + k * 21;
    raiz.append(svg("line", { x1: x, x2: x, y1: area.y0 - 6, y2: area.y1, class: "ex-evento-linha" }));
    raiz.append(svg("g", { class: "ex-evento", "data-evento": e.numero, "data-periodo": cfg.periodos[e.indice] },
      svg("circle", { cx: gx, cy: area.y0 - 16, r: 9 }, svg("title", {}, `${e.numero}. ${e.titulo} (${cfg.periodos[e.indice]})`)),
      svg("text", { x: gx, y: area.y0 - 12, "text-anchor": "middle" }, e.numero)));
  }

  // Séries: linha, pontos (círculo para A, quadrado para B) e valores acessíveis em <title>.
  cfg.series.forEach((s, idx) => {
    const g = geo.series[idx];
    const caminho = g.segmentos.map((seg) => seg.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")).join(" ");
    raiz.append(svg("path", { d: caminho, class: `ex-linha ex-linha-${s.chave}`, fill: "none", "data-serie": s.chave }));
    for (const p of g.pontos) {
      if (p === null) continue;
      const attrs = { class: `ex-pt ex-pt-${s.chave}`, "data-serie": s.chave, "data-periodo": p.periodo, "data-valor": Math.round(p.valor * 1e6) / 1e6 };
      const t = svg("title", {}, `${s.rotulo}, ${p.periodo}: ${s.fmt(p.valor)}`);
      raiz.append(s.chave === "A" ? svg("circle", { ...attrs, cx: p.x, cy: p.y, r: 3.2 }, t) : svg("rect", { ...attrs, x: p.x - 3, y: p.y - 3, width: 6, height: 6 }, t));
    }
  });

  // Marcas de recorde e de mínimo da série exibida (só quando o máximo ou o mínimo é único).
  cfg.series.forEach((s, idx) => {
    const g = geo.series[idx];
    for (const [tipo, marca, rotulo, acima] of [["recorde", s.marcas.recorde, "Máx.", true], ["minimo", s.marcas.minimo, "Mín.", false]]) {
      if (!marca || marca.periodo === null) continue;
      const p = g.pontos[cfg.periodos.indexOf(marca.periodo)];
      if (!p) continue;
      const ancora = p.x > area.x1 - 90 ? "end" : p.x < area.x0 + 90 ? "start" : "middle";
      const dy = acima ? -12 : 20;
      raiz.append(svg("g", { class: `ex-marca ex-${tipo} ex-marca-${s.chave}`, "data-serie": s.chave, "data-tipo": tipo, "data-periodo": p.periodo, "data-valor": Math.round(p.valor * 1e6) / 1e6 },
        svg("circle", { cx: p.x, cy: p.y, r: 7, fill: "none" }),
        svg("text", { x: p.x, y: Math.max(area.y0 + 8, Math.min(area.y1 + 14, p.y + dy)), "text-anchor": ancora }, `${rotulo} ${s.fmt(p.valor)}`)));
    }
  });

  // Eixo do tempo.
  raiz.append(svg("line", { x1: area.x0, x2: area.x1, y1: area.y1, y2: area.y1, class: "ex-base" }));
  const n = cfg.periodos.length;
  const ultimoX = geo.x(n - 1);
  let ultimoRotulo = -Infinity;
  cfg.periodos.forEach((p, i) => {
    if (!cfg.rotulosX[i]) return;
    const x = geo.x(i);
    if (i !== n - 1 && ultimoX - x < 40) return;
    if (x - ultimoRotulo < 44) return; // rótulos nunca se encostam: em tela estreita sobram só alguns anos
    ultimoRotulo = x;
    raiz.append(svg("text", { x, y: H - 12, class: "ex-eixo-x", "text-anchor": i === n - 1 && x > area.x1 - 14 ? "end" : "middle" }, p));
  });

  alvo.replaceChildren(raiz);
  return { largura: W, altura: H, geo };
}
