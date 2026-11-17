// Carregamento dos dados. O site é estático: só lê arquivos do próprio diretório.
import { indexar } from "./calculos.js";

async function ler(nome) {
  const r = await fetch(nome, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`);
  return r.json();
}

/** data_site.json (números, gerado da base), anotacoes.json (contexto escrito pelo Gu) e data_painel.json (região e marca, gerado do banco). */
export async function carregar() {
  const [ds, an, dp] = await Promise.all([ler("data_site.json"), ler("anotacoes.json"), ler("data_painel.json")]);
  return { ds, an, dp, ix: indexar(ds) };
}
