// Carregamento dos dados. O site é estático: só lê arquivos do próprio diretório.
import { indexar } from "./calculos.js";

async function ler(nome) {
  const r = await fetch(nome, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`);
  return r.json();
}

/** data_site.json (números, gerado da base), anotacoes.json (contexto escrito pelo Gu), data_painel.json (região e marca, gerado do banco) data_institucional.json (textos do site oficial de RI, estruturados) e data_externos.json (séries públicas do Banco Central e do IBGE). */
export async function carregar() {
  const [ds, an, dp, di, ext] = await Promise.all([ler("data_site.json"), ler("anotacoes.json"), ler("data_painel.json"), ler("data_institucional.json"), ler("data_externos.json")]);
  return { ds, an, dp, di, ext, ix: indexar(ds) };
}
