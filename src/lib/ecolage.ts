import type { TypeEcheance } from "@/generated/prisma/enums";
import { lireJour, type Jour } from "@/lib/dates";
import { formaterAriary } from "@/lib/montant";
import { NOMS_MOIS } from "@/lib/parametres";

// Règles de l'écolage. Isomorphe et pur (serveur, Encaisser hors ligne, admissions) : ni base, ni horloge.

export const TRANCHES_POSSIBLES = [1, 2, 3] as const;
export type NombreTranches = (typeof TRANCHES_POSSIBLES)[number];

/** Les tranches sont arrondies au millier inférieur ; le reste va sur la 1re. */
const ARRONDI_TRANCHE = 1000;

export type TarifEcheances = { droitsInscription: number; montantMensuel: number; nombreMois: number };
export type AnneeEcheances = { anneeDebut: number; moisDebutEcolage: number };

export type EcheanceGeneree = {
  type: TypeEcheance;
  /** 1 à 3 pour les droits, null pour une mensualité. */
  tranche: number | null;
  /** 1er du mois d'exigibilité, à minuit UTC (colonne `@db.Date`). */
  mois: Date;
  /** Ordre de solde dans l'inscription, à partir de 1. */
  ordre: number;
  montantDu: number;
};

function estEntier(n: number): boolean {
  return Number.isInteger(n);
}

/** Message si les droits ne peuvent pas être découpés en `n` tranches, sinon null. */
export function controleTranches(droits: number, n: number): string | null {
  if (!TRANCHES_POSSIBLES.includes(n as NombreTranches)) return "Choisissez un paiement des droits en 1, 2 ou 3 fois.";
  if (!estEntier(droits) || droits <= 0) return "Les droits d'inscription du tarif sont invalides : vérifiez le tarif dans Paramètres › Tarifs.";
  const part = Math.floor(droits / n / ARRONDI_TRANCHE) * ARRONDI_TRANCHE;
  if (n > 1 && part <= 0) {
    return `Les droits d'inscription (${formaterAriary(droits)}) sont trop faibles pour être payés en ${n} fois : choisissez un paiement en une fois.`;
  }
  return null;
}

/** 100 000 en 3 → [34 000, 33 000, 33 000]. Lève une RangeError (message affichable) si le découpage est impossible. */
export function tranchesDroits(droits: number, n: number): number[] {
  const refus = controleTranches(droits, n);
  if (refus) throw new RangeError(refus);
  const part = Math.floor(droits / n / ARRONDI_TRANCHE) * ARRONDI_TRANCHE;
  return Array.from({ length: n }, (_, k) => (k === 0 ? droits - part * (n - 1) : part));
}

function premierDuMois(annee: number, moisIndex0: number): Date {
  return new Date(Date.UTC(annee, moisIndex0, 1));
}

/**
 * Échéances d'une année complète (pas d'inscription en cours d'année) : tranche k des droits au mois k,
 * une mensualité par mois ; montants copiés du tarif, pour qu'un changement de tarif ne réécrive pas le passé.
 */
export function genererEcheances(
  tarif: TarifEcheances,
  annee: AnneeEcheances,
  droitsEnTranches: number,
): EcheanceGeneree[] {
  if (!estEntier(tarif.montantMensuel) || tarif.montantMensuel <= 0) {
    throw new RangeError("La mensualité du tarif est invalide : vérifiez le tarif dans Paramètres › Tarifs.");
  }
  if (!estEntier(tarif.nombreMois) || tarif.nombreMois < 1 || tarif.nombreMois > 12) {
    throw new RangeError("Le nombre de mois du tarif est invalide : vérifiez le tarif dans Paramètres › Tarifs.");
  }
  if (!estEntier(annee.moisDebutEcolage) || annee.moisDebutEcolage < 1 || annee.moisDebutEcolage > 12) {
    throw new RangeError(`Mois de début d'écolage invalide : ${annee.moisDebutEcolage}.`);
  }
  const tranches = tranchesDroits(tarif.droitsInscription, droitsEnTranches);
  const debut = annee.moisDebutEcolage - 1;
  const nbMois = Math.max(tarif.nombreMois, tranches.length);

  const echeances: EcheanceGeneree[] = [];
  let ordre = 1;
  for (let i = 0; i < nbMois; i++) {
    const mois = premierDuMois(annee.anneeDebut, debut + i);
    if (i < tranches.length) {
      echeances.push({
        type: "DROITS",
        tranche: i + 1,
        mois,
        ordre: ordre++,
        montantDu: tranches[i],
      });
    }
    if (i < tarif.nombreMois) {
      echeances.push({ type: "MENSUALITE", tranche: null, mois, ordre: ordre++, montantDu: tarif.montantMensuel });
    }
  }
  return echeances;
}

type EcheanceMontant = { type: TypeEcheance; montantDu: number };

/**
 * Montants d'origine d'une inscription, relus sur ses échéances : pour redécouper les droits
 * sans relire un tarif qui a pu changer depuis.
 */
export function tarifDepuisEcheances(echeances: EcheanceMontant[]): TarifEcheances {
  const droits = echeances.filter((e) => e.type === "DROITS");
  const mensualites = echeances.filter((e) => e.type === "MENSUALITE");
  const montants = new Set(mensualites.map((e) => e.montantDu));
  if (droits.length === 0 || mensualites.length === 0 || montants.size !== 1) {
    throw new RangeError("Échéancier incohérent : redécoupage des droits impossible. Prévenez le responsable technique.");
  }
  return {
    droitsInscription: droits.reduce((s, e) => s + e.montantDu, 0),
    montantMensuel: mensualites[0].montantDu,
    nombreMois: mensualites.length,
  };
}

/** « Droits d'inscription », « Droits — tranche 2/3 », « Octobre 2026 ». */
export function libelleEcheance(
  e: { type: TypeEcheance; tranche: number | null; mois: Date },
  droitsEnTranches: number,
): string {
  if (e.type === "DROITS") {
    return droitsEnTranches > 1 ? `Droits — tranche ${e.tranche ?? 1}/${droitsEnTranches}` : "Droits d'inscription";
  }
  const nom = NOMS_MOIS[e.mois.getUTCMonth()];
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${e.mois.getUTCFullYear()}`;
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

/** Un mois passé payé en partie est « en retard » ; « partiel » seulement tant que le mois n'est pas échu. */
export function statutEcheance(montantDu: number, paye: number, mois: Date, jour: Jour): StatutEcheance {
  if (paye >= montantDu) return "paye";
  if (estEchue(mois, jour)) return "retard";
  return paye > 0 ? "partiel" : "a_venir";
}

/** Échéance avec ce qui a été payé dessus (somme des lignes de paiements non annulés). */
export type EcheancePayee = {
  id: string;
  /** Année scolaire de l'inscription (2026 pour 2026-2027). */
  anneeDebut: number;
  mois: Date;
  ordre: number;
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
  /** Mois distincts ayant au moins une échéance échue non soldée (tranche et mensualité d'un même mois = 1). */
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

type CleSolde = { mois: Date; anneeDebut: number; ordre: number };

/** Ordre de solde, toutes années confondues : la plus ancienne d'abord (mois, puis année scolaire, puis ordre). */
export function trierPourSolde<E extends CleSolde>(echeances: readonly E[]): E[] {
  return [...echeances].sort(
    (a, b) => a.mois.getTime() - b.mois.getTime() || a.anneeDebut - b.anneeDebut || a.ordre - b.ordre,
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
