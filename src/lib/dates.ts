// Calendrier de Madagascar (UTC+3, sans heure d'été). L'instant est toujours passé en paramètre :
// l'appelant lit l'horloge une fois (`new Date()`), puis le jour obtenu est injecté dans la logique pure.

export const FUSEAU_MADAGASCAR = "Indian/Antananarivo";

/** Jour calendaire « AAAA-MM-JJ ». */
export type Jour = string;

const FORMAT_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

const formateur = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSEAU_MADAGASCAR,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parties(instant: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  if (Number.isNaN(instant.getTime())) throw new RangeError("Date invalide.");
  const p = Object.fromEntries(formateur.formatToParts(instant).map((x) => [x.type, x.value]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute };
}

/** Jour à Madagascar pour un instant donné : « 2026-10-11 ». */
export function jourMadagascar(instant: Date): Jour {
  const p = parties(instant);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Date et heure à afficher sur un reçu : « 11/10/2026 » et « 10:24 », heure de Madagascar. */
export function dateHeureMadagascar(instant: Date): { jour: Jour; date: string; heure: string } {
  const p = parties(instant);
  return { jour: `${p.year}-${p.month}-${p.day}`, date: `${p.day}/${p.month}/${p.year}`, heure: `${p.hour}:${p.minute}` };
}

/** Lit un jour « AAAA-MM-JJ » ; lève une erreur sur un format ou une date inexistante (bug de l'appelant). */
export function lireJour(jour: Jour): { annee: number; mois: number; jour: number } {
  const m = FORMAT_JOUR.exec(jour);
  if (!m) throw new RangeError(`Jour invalide : « ${jour} » (attendu AAAA-MM-JJ).`);
  const [annee, mois, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(annee, mois - 1, j));
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== j) {
    throw new RangeError(`Jour inexistant : « ${jour} ».`);
  }
  return { annee, mois, jour: j };
}

/** Le jour à minuit UTC, comme une colonne `@db.Date` lue par Prisma. */
export function dateDuJour(jour: Jour): Date {
  const { annee, mois, jour: j } = lireJour(jour);
  return new Date(Date.UTC(annee, mois - 1, j));
}

const DECALAGE_MADAGASCAR_MS = 3 * 60 * 60 * 1000;

/** Instant où commence ce jour à Madagascar : bornes des filtres de période sur `Paiement.date`. */
export function debutJourMadagascar(jour: Jour): Date {
  return new Date(dateDuJour(jour).getTime() - DECALAGE_MADAGASCAR_MS);
}

/** « 2026-10-31 » + 1 → « 2026-11-01 ». */
export function ajouterJours(jour: Jour, n: number): Jour {
  const d = dateDuJour(jour);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 1er du mois, `n` mois plus loin : « 2026-10-15 » + 1 → « 2026-11-01 ». */
export function premierDuMoisSuivant(jour: Jour, n = 1): Jour {
  const { annee, mois } = lireJour(jour);
  return new Date(Date.UTC(annee, mois - 1 + n, 1)).toISOString().slice(0, 10);
}

/** Colonne `@db.Date` (minuit UTC) → « 2026-10-01 ». */
export function jourDeDate(d: Date): Jour {
  return d.toISOString().slice(0, 10);
}

/** « 2026-10-01 » → « 01/10/2026 ». */
export function formaterJour(jour: Jour): string {
  const { annee, mois, jour: j } = lireJour(jour);
  return `${String(j).padStart(2, "0")}/${String(mois).padStart(2, "0")}/${annee}`;
}

/** Année civile du jour : celle du numéro de reçu `R-{année}-…`. */
export function anneeCivile(jour: Jour): number {
  return lireJour(jour).annee;
}
