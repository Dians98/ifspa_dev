import type { TypeEcheance } from "@/generated/prisma/enums";
import { lireJour, type Jour } from "@/lib/dates";
import { formaterAriary } from "@/lib/montant";
import { NOMS_MOIS } from "@/lib/parametres";

// Règles de l'écolage. Isomorphe et pur (serveur, Encaisser hors ligne, admissions) : ni base, ni horloge.

export type TarifEcheances = { droitsInscription: number; montantMensuel: number; nombreMois: number };
export type AnneeEcheances = { anneeDebut: number; moisDebutEcolage: number };

export type EcheanceGeneree = {
  type: TypeEcheance;
  /** 1er du mois d'exigibilité, à minuit UTC (colonne `@db.Date`). */
  mois: Date;
  montantDu: number;
  /** Frais d'origine d'une échéance FRAIS, null sinon. */
  fraisId: string | null;
};

function estEntier(n: number): boolean {
  return Number.isInteger(n);
}

function premierDuMois(annee: number, moisIndex0: number): Date {
  return new Date(Date.UTC(annee, moisIndex0, 1));
}

/** Message si les droits du tarif ne peuvent pas être copiés sur une échéance, sinon null. */
export function controleDroits(droits: number): string | null {
  if (!estEntier(droits) || droits <= 0) {
    return "Les droits d'inscription du tarif sont invalides : vérifiez le tarif dans Paramètres › Tarifs.";
  }
  return null;
}

/** Droits exigibles le 1er mois de l'année scolaire, en retard dès le 1er du 2e mois. */
export function moisDroits(annee: AnneeEcheances): Date {
  if (!estEntier(annee.moisDebutEcolage) || annee.moisDebutEcolage < 1 || annee.moisDebutEcolage > 12) {
    throw new RangeError(`Mois de début d'écolage invalide : ${annee.moisDebutEcolage}.`);
  }
  return premierDuMois(annee.anneeDebut, annee.moisDebutEcolage - 1);
}

/**
 * Échéances d'une année complète (pas d'inscription en cours d'année) : une échéance de droits,
 * une mensualité par mois ; montants copiés du tarif, pour qu'un changement de tarif ne réécrive pas le passé.
 */
export function genererEcheances(tarif: TarifEcheances, annee: AnneeEcheances): EcheanceGeneree[] {
  const refus = controleDroits(tarif.droitsInscription);
  if (refus) throw new RangeError(refus);
  if (!estEntier(tarif.montantMensuel) || tarif.montantMensuel <= 0) {
    throw new RangeError("La mensualité du tarif est invalide : vérifiez le tarif dans Paramètres › Tarifs.");
  }
  if (!estEntier(tarif.nombreMois) || tarif.nombreMois < 1 || tarif.nombreMois > 12) {
    throw new RangeError("Le nombre de mois du tarif est invalide : vérifiez le tarif dans Paramètres › Tarifs.");
  }
  const echeances: EcheanceGeneree[] = [
    { type: "DROITS", mois: moisDroits(annee), montantDu: tarif.droitsInscription, fraisId: null },
  ];
  for (let i = 0; i < tarif.nombreMois; i++) {
    echeances.push({
      type: "MENSUALITE",
      mois: premierDuMois(annee.anneeDebut, annee.moisDebutEcolage - 1 + i),
      montantDu: tarif.montantMensuel,
      fraisId: null,
    });
  }
  return echeances;
}

/** Échéance d'un frais pour une inscription : même montant et même mois pour tous les concernés. */
export function echeanceFrais(frais: { id: string; montant: number; mois: Date }): EcheanceGeneree {
  if (!estEntier(frais.montant) || frais.montant <= 0) throw new RangeError("Montant du frais invalide.");
  return { type: "FRAIS", mois: frais.mois, montantDu: frais.montant, fraisId: frais.id };
}

/** « Octobre 2026 ». */
export function libelleMois(mois: Date): string {
  const nom = NOMS_MOIS[mois.getUTCMonth()];
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${mois.getUTCFullYear()}`;
}

/** « Droits d'inscription », « Octobre 2026 », ou le libellé du frais. */
export function libelleEcheance(e: { type: TypeEcheance; mois: Date; libelleFrais?: string | null }): string {
  if (e.type === "DROITS") return "Droits d'inscription";
  if (e.type === "FRAIS") return e.libelleFrais?.trim() || "Frais";
  return libelleMois(e.mois);
}

// Retard et statuts

export type StatutEcheance = "paye" | "partiel" | "retard" | "a_venir";

export const LIBELLE_STATUT_ECHEANCE: Record<StatutEcheance, string> = {
  paye: "Payé",
  partiel: "Partiel",
  retard: "En retard",
  a_venir: "À venir",
};

function indexMois(annee: number, mois1a12: number): number {
  return annee * 12 + (mois1a12 - 1);
}

/**
 * 1er du mois courant à Madagascar, à minuit UTC : une échéance est en retard si `mois < dateLimite`.
 * Sert tel quel en SQL (filtre « en retard », « attendu à date » du dashboard).
 */
export function dateLimiteRetard(jour: Jour): Date {
  const { annee, mois } = lireJour(jour);
  return new Date(Date.UTC(annee, mois - 1, 1));
}

/** Échéance du mois M échue à partir du 1er du mois M+1. */
export function estEchue(mois: Date, jour: Jour): boolean {
  const j = lireJour(jour);
  return indexMois(mois.getUTCFullYear(), mois.getUTCMonth() + 1) < indexMois(j.annee, j.mois);
}

/** Échéance du mois M exigible dès le 1er du mois M (mois passés et mois en cours). */
export function estExigible(mois: Date, jour: Jour): boolean {
  const j = lireJour(jour);
  return indexMois(mois.getUTCFullYear(), mois.getUTCMonth() + 1) <= indexMois(j.annee, j.mois);
}

/** Un mois passé payé en partie est « en retard » ; « partiel » seulement tant que le mois n'est pas échu. */
export function statutEcheance(montantDu: number, paye: number, mois: Date, jour: Jour): StatutEcheance {
  if (paye >= montantDu) return "paye";
  if (estEchue(mois, jour)) return "retard";
  return paye > 0 ? "partiel" : "a_venir";
}

/** Échéance avec ce qui a été payé dessus (somme des lignes de paiements non annulés). */
export type EcheancePayee = {
  id: string;
  type: TypeEcheance;
  /** Année scolaire de l'inscription (2026 pour 2026-2027). */
  anneeDebut: number;
  mois: Date;
  /** `Frais.rang` d'une échéance FRAIS : deux frais du même mois se soldent dans l'ordre de création. */
  rangFrais?: number | null;
  montantDu: number;
  paye: number;
  /** Mois postérieur à une sortie, rien payé dessus : ignorée par `situation()`. */
  nonDueSortie?: boolean;
};

export type EcheanceSuivie<E extends EcheancePayee = EcheancePayee> = E & {
  reste: number;
  echue: boolean;
  statut: StatutEcheance;
};

export function suivreEcheance<E extends EcheancePayee>(e: E, jour: Jour): EcheanceSuivie<E> {
  return {
    ...e,
    reste: Math.max(0, e.montantDu - e.paye),
    echue: estEchue(e.mois, jour),
    statut: statutEcheance(e.montantDu, e.paye, e.mois, jour),
  };
}

export type TotauxEcolage = {
  du: number;
  paye: number;
  reste: number;
  /** Reste dû sur les échéances échues. */
  resteEnRetard: number;
  /** Mois distincts ayant au moins une échéance échue non soldée (droits, mensualité ou frais d'un même mois = 1). */
  moisEnRetard: number;
  /** « Attendu à date » : dû des échéances échues. */
  duEchu: number;
  /** Payé sur les échéances échues. */
  payeEchu: number;
};

export type SituationEcolage = TotauxEcolage & {
  /** Une entrée par année scolaire, de la plus ancienne à la plus récente. */
  parAnnee: (TotauxEcolage & { anneeDebut: number })[];
};

function totaux(echeances: EcheancePayee[], jour: Jour): TotauxEcolage {
  const t: TotauxEcolage = { du: 0, paye: 0, reste: 0, resteEnRetard: 0, moisEnRetard: 0, duEchu: 0, payeEchu: 0 };
  const moisRetard = new Set<string>();
  for (const e of echeances) {
    const s = suivreEcheance(e, jour);
    const payeRetenu = Math.min(e.paye, e.montantDu);
    t.du += e.montantDu;
    t.paye += payeRetenu;
    t.reste += s.reste;
    if (s.echue) {
      t.duEchu += e.montantDu;
      t.payeEchu += payeRetenu;
      t.resteEnRetard += s.reste;
      if (s.reste > 0) moisRetard.add(`${e.mois.getUTCFullYear()}-${e.mois.getUTCMonth()}`);
    }
  }
  t.moisEnRetard = moisRetard.size;
  return t;
}

export function situation(toutes: EcheancePayee[], jour: Jour): SituationEcolage {
  const echeances = toutes.filter((e) => !e.nonDueSortie);
  const annees = [...new Set(echeances.map((e) => e.anneeDebut))].sort((a, b) => a - b);
  return {
    ...totaux(echeances, jour),
    parAnnee: annees.map((anneeDebut) => ({
      anneeDebut,
      ...totaux(
        echeances.filter((e) => e.anneeDebut === anneeDebut),
        jour,
      ),
    })),
  };
}

// Répartition d'un paiement

type CleSolde = { id: string; type: TypeEcheance; mois: Date; anneeDebut: number; rangFrais?: number | null };

function comparerId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Rang dans une année scolaire : 1 droits, 2 mensualités exigibles, 3 frais exigibles,
 * 4 mensualités à venir, 5 frais à venir. Dépend du jour : serveur et poste doivent passer le même.
 */
export function rangSolde(e: { type: TypeEcheance; mois: Date }, jour: Jour): number {
  if (e.type === "DROITS") return 1;
  const exigible = estExigible(e.mois, jour);
  if (e.type === "MENSUALITE") return exigible ? 2 : 4;
  return exigible ? 3 : 5;
}

/** Ordre de solde : année par année (la plus ancienne d'abord), puis rang, mois, ordre de création des frais, id. */
export function trierPourSolde<E extends CleSolde>(echeances: readonly E[], jour: Jour): E[] {
  const rangs = new Map(echeances.map((e) => [e, rangSolde(e, jour)]));
  return [...echeances].sort(
    (a, b) =>
      a.anneeDebut - b.anneeDebut ||
      rangs.get(a)! - rangs.get(b)! ||
      a.mois.getTime() - b.mois.getTime() ||
      (a.rangFrais ?? 0) - (b.rangFrais ?? 0) ||
      comparerId(a, b),
  );
}

const RANG_LECTURE: Record<TypeEcheance, number> = { DROITS: 0, MENSUALITE: 1, FRAIS: 2 };

/** Ordre de lecture (fiche, relevé) : année, droits, puis mois par mois, la mensualité avant les frais. */
export function trierChronologique<E extends CleSolde>(echeances: readonly E[]): E[] {
  return [...echeances].sort(
    (a, b) =>
      a.anneeDebut - b.anneeDebut ||
      Number(b.type === "DROITS") - Number(a.type === "DROITS") ||
      a.mois.getTime() - b.mois.getTime() ||
      RANG_LECTURE[a.type] - RANG_LECTURE[b.type] ||
      (a.rangFrais ?? 0) - (b.rangFrais ?? 0) ||
      comparerId(a, b),
  );
}

/** Échéance non soldée, déjà triée par `trierPourSolde` ; `reste` = montant dû moins payé. */
export type EcheanceAPayer = { id: string; reste: number };

export type LigneRepartie = {
  echeanceId: string;
  montant: number;
  /** Reste dû sur l'échéance après ce paiement : > 0 pour un acompte. */
  resteEcheance: number;
};

export type Repartition =
  | {
      ok: true;
      lignes: LigneRepartie[];
      /** Dernière échéance payée seulement en partie, s'il y en a une. */
      acompte: LigneRepartie | null;
      /** Reste dû total de l'étudiant après ce paiement. */
      resteDuApres: number;
    }
  | { ok: false; erreur: string };

export function resteDuTotal(nonSoldees: readonly EcheanceAPayer[]): number {
  return nonSoldees.reduce((s, e) => s + Math.max(0, e.reste), 0);
}

/** Répartit `montant` de la plus ancienne à la plus récente ; la dernière échéance touchée peut ne l'être qu'en partie. */
export function repartirPaiement(nonSoldees: readonly EcheanceAPayer[], montant: number): Repartition {
  if (!Number.isFinite(montant) || !estEntier(montant)) {
    return { ok: false, erreur: "Saisissez un montant entier en ariary, sans décimales." };
  }
  if (montant <= 0) return { ok: false, erreur: "Le montant doit être supérieur à 0." };
  if (nonSoldees.some((e) => !estEntier(e.reste))) throw new RangeError("Reste d'échéance non entier.");

  const total = resteDuTotal(nonSoldees);
  if (total === 0) return { ok: false, erreur: "Cet étudiant n'a rien à payer : toutes ses échéances sont soldées." };
  if (montant > total) {
    return {
      ok: false,
      erreur: `Le montant dépasse ce que l'étudiant doit encore : ${formaterAriary(total)} au plus, toutes années comprises.`,
    };
  }

  const lignes: LigneRepartie[] = [];
  let disponible = montant;
  for (const e of nonSoldees) {
    if (disponible === 0) break;
    if (e.reste <= 0) continue;
    const impute = Math.min(disponible, e.reste);
    lignes.push({ echeanceId: e.id, montant: impute, resteEcheance: e.reste - impute });
    disponible -= impute;
  }
  const derniere = lignes[lignes.length - 1];
  return {
    ok: true,
    lignes,
    acompte: derniere && derniere.resteEcheance > 0 ? derniere : null,
    resteDuApres: total - montant,
  };
}

type EcheanceAPayerDatee = EcheanceAPayer & { mois: Date };

/** Restes à figer sur le reçu : reste total et reste en retard, une fois les lignes imputées. */
export function restesApres(
  nonSoldees: readonly EcheanceAPayerDatee[],
  lignes: readonly Pick<LigneRepartie, "echeanceId" | "montant">[],
  jour: Jour,
): { resteApres: number; retardApres: number } {
  const impute = new Map<string, number>();
  for (const l of lignes) impute.set(l.echeanceId, (impute.get(l.echeanceId) ?? 0) + l.montant);
  let resteApres = 0;
  let retardApres = 0;
  for (const e of nonSoldees) {
    const reste = Math.max(0, e.reste - (impute.get(e.id) ?? 0));
    resteApres += reste;
    if (estEchue(e.mois, jour)) retardApres += reste;
  }
  return { resteApres, retardApres };
}

/** Montant prérempli pour les `k` premières cases (le cochage se fait dans l'ordre de solde). */
export function montantPourCases(nonSoldees: readonly EcheanceAPayer[], k: number): number {
  if (!estEntier(k) || k < 0 || k > nonSoldees.length) {
    throw new RangeError(`Nombre de cases invalide : ${k} (entre 0 et ${nonSoldees.length}).`);
  }
  return resteDuTotal(nonSoldees.slice(0, k));
}
