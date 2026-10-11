// Montants en ariary : toujours des entiers, jamais de décimales.

/** Séparateur des milliers : espace fine insécable (U+202F), comme `Intl.NumberFormat("fr-FR")`. */
export const ESPACE_MILLIERS = " ";
/** Entre le nombre et « Ar » : espace insécable (U+00A0), pour que l'unité ne passe jamais seule à la ligne. */
export const ESPACE_UNITE = " ";

/** Garde-fou technique, bien au-dessous de la limite d'un `Int` PostgreSQL (2 147 483 647). */
export const MONTANT_MAX = 1_000_000_000;

export type LectureMontant = { ok: true; valeur: number } | { ok: false; erreur: string };

type OptionsMontant = {
  /** 0 est refusé par défaut. */
  zeroAutorise?: boolean;
};

// `\s` couvre déjà les espaces insécables et fines (U+00A0, U+202F, U+2009).
const ESPACES = /\s/g;

/** Lit un montant saisi (« 100 000 », « 100000 », « 80 000 Ar »). Refuse décimales, négatifs et texte. */
export function lireMontant(texte: string, options: OptionsMontant = {}): LectureMontant {
  const brut = texte.trim().replace(/ar$/i, "").replace(ESPACES, "");
  if (brut === "") return { ok: false, erreur: "Saisissez un montant." };
  if (brut.startsWith("-")) return { ok: false, erreur: "Le montant ne peut pas être négatif." };
  if (/[.,]/.test(brut)) {
    return { ok: false, erreur: "Saisissez un montant entier en ariary, sans virgule ni point (ex. 80 000)." };
  }
  if (!/^\d+$/.test(brut)) return { ok: false, erreur: "Saisissez uniquement des chiffres (ex. 80 000)." };
  return verifierMontant(Number(brut), options);
}

/** Contrôle un montant déjà numérique (entrée d'une action appelée avec un nombre). */
export function verifierMontant(n: number, options: OptionsMontant = {}): LectureMontant {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, erreur: "Saisissez un montant entier en ariary, sans décimales." };
  }
  if (n < 0) return { ok: false, erreur: "Le montant ne peut pas être négatif." };
  if (n === 0 && !options.zeroAutorise) return { ok: false, erreur: "Le montant doit être supérieur à 0." };
  if (n > MONTANT_MAX) return { ok: false, erreur: "Montant trop élevé : vérifiez le nombre de zéros." };
  return { ok: true, valeur: n };
}

/** « 80 000 » : chiffres groupés par milliers, sans unité (champs de saisie, tableaux). */
export function formaterNombre(n: number): string {
  if (!Number.isInteger(n)) throw new RangeError(`Montant non entier : ${n}`);
  const signe = n < 0 ? "-" : "";
  const chiffres = String(Math.abs(n));
  return signe + chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_MILLIERS);
}

/** « 80 000 Ar ». Lève une erreur sur un montant non entier : c'est un bug, pas une donnée à afficher. */
export function formaterAriary(n: number): string {
  return `${formaterNombre(n)}${ESPACE_UNITE}Ar`;
}
