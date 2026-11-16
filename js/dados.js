// Carregamento dos dados. O site é estático: só lê arquivos do próprio diretório.
import { indexar } from "./calculos.js";

async function ler(nome) {
  const r = await fetch(nome, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`);
  return r.json();
}

/** data_site.json (números, gerado da base) e anotacoes.json (contexto escrito pelo Gu). */
export async function carregar() {
  const [ds, an] = await Promise.all([ler("data_site.json"), ler("anotacoes.json")]);
  return { ds, an, ix: indexar(ds) };
}
