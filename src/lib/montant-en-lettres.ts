// Montant en lettres, orthographe traditionnelle (sans traits d'union généralisés de 1990), comme la maquette du reçu.

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

const LIMITE = 1_000_000_000_000;

function deuxChiffres(n: number): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    const base = d === 7 ? "soixante" : "quatre-vingt";
    const r = n - (d === 7 ? 60 : 80);
    return d === 7 && r === 11 ? `${base} et onze` : `${base}-${UNITES[r]}`;
  }
  if (d === 8) return u === 0 ? "quatre-vingts" : `quatre-vingt-${UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  return u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`;
}

/** `final` : « cents » et « quatre-vingts » ne prennent le s qu'en fin de nombre ou devant million/milliard, jamais devant mille. */
function troisChiffres(n: number, final: boolean): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let s = "";
  if (c > 0) s = (c === 1 ? "cent" : `${UNITES[c]} cent`) + (r === 0 && c > 1 && final ? "s" : "");
  if (r > 0) {
    const d = !final && r === 80 ? "quatre-vingt" : deuxChiffres(r);
    s += (s ? " " : "") + d;
  }
  return s;
}

/** 1 250 000 → « un million deux cent cinquante mille ». */
export function nombreEnLettres(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= LIMITE) throw new RangeError(`Montant hors limites : ${n}.`);
  if (n === 0) return "zéro";
  const milliards = Math.floor(n / 1_000_000_000);
  const millions = Math.floor(n / 1_000_000) % 1000;
  const milliers = Math.floor(n / 1000) % 1000;
  const unites = n % 1000;
  const parts: string[] = [];
  if (milliards) parts.push(`${troisChiffres(milliards, true)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) parts.push(`${troisChiffres(millions, true)} million${millions > 1 ? "s" : ""}`);
  if (milliers) parts.push(milliers === 1 ? "mille" : `${troisChiffres(milliers, false)} mille`);
  if (unites) parts.push(troisChiffres(unites, true));
  return parts.join(" ");
}

/** « cent cinquante mille ariary », « un million d'ariary » (million et milliard sont des noms : « de »). */
export function montantEnLettres(n: number): string {
  const lettres = nombreEnLettres(n);
  return n >= 1_000_000 && n % 1_000_000 === 0 ? `${lettres} d'ariary` : `${lettres} ariary`;
}
