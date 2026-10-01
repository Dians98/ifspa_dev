import path from "node:path";
import { pathToFileURL } from "node:url";

/** URL file:// d'une page de la maquette, ex. maquette("encaissement.html?id=4"). */
export function maquette(page: string): string {
  const [fichier, requete] = page.split("?");
  const url = pathToFileURL(path.resolve(__dirname, "../../prototype", fichier));
  if (requete) url.search = requete;
  return url.href;
}
