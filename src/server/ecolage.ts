import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { StatutEtudiant, TypeEcheance } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { jourDeDate } from "@/lib/dates";
import { libelleEcheance, trierPourSolde, type EcheancePayee } from "@/lib/ecolage";
import type { EcheanceCopie } from "@/lib/encaissement-hors-ligne";

type Tx = Prisma.TransactionClient;

/** Base cPanel parfois lente : on laisse du temps aux transactions interactives. */
export const OPTIONS_TRANSACTION = { timeout: 15_000, maxWait: 10_000 } as const;

/** Reprise des données : jusqu'à 2 000 étudiants et 10 000 paiements dans une seule transaction. */
export const OPTIONS_TRANSACTION_REPRISE = { timeout: 120_000, maxWait: 10_000 } as const;

/**
 * Verrou de l'étudiant puis de toutes ses échéances (toutes années), toujours dans cet ordre :
 * encaisser, annuler un paiement et redécouper les droits ne peuvent ni se croiser ni s'interbloquer.
 */
export async function verrouillerEtudiant(
  tx: Tx,
  etudiantId: string,
): Promise<{ id: string; statut: StatutEtudiant } | null> {
  const [etudiant] = await tx.$queryRaw<{ id: string; statut: StatutEtudiant }[]>`
    SELECT id, statut::text AS statut FROM etudiant WHERE id = ${etudiantId} FOR UPDATE`;
  if (!etudiant) return null;
  await tx.$queryRaw`
    SELECT ec.id FROM echeance ec JOIN inscription i ON i.id = ec."inscriptionId"
    WHERE i."etudiantId" = ${etudiantId} ORDER BY ec.id FOR UPDATE OF ec`;
  return etudiant;
}

export type EcheanceDossier = EcheancePayee & {
  inscriptionId: string;
  type: TypeEcheance;
  tranche: number | null;
  droitsEnTranches: number;
  /** « 2026-2027 » */
  anneeLibelle: string;
  libelle: string;
  nonDueSortie: boolean;
  /** Lignes de paiements non annulés : une seule suffit à garder l'échéance due après une sortie. */
  lignesNonAnnulees: number;
};

const SELECT_ECHEANCE_DOSSIER = {
  id: true,
  inscriptionId: true,
  type: true,
  tranche: true,
  mois: true,
  ordre: true,
  montantDu: true,
  nonDueSortie: true,
  inscription: {
    select: { etudiantId: true, droitsEnTranches: true, anneeScolaire: { select: { anneeDebut: true, libelle: true } } },
  },
  lignesPaiement: { where: { paiement: { annule: false } }, select: { montant: true } },
} as const satisfies Prisma.EcheanceSelect;

function echeanceDossier(e: Prisma.EcheanceGetPayload<{ select: typeof SELECT_ECHEANCE_DOSSIER }>): EcheanceDossier {
  return {
    id: e.id,
    inscriptionId: e.inscriptionId,
    type: e.type,
    tranche: e.tranche,
    mois: e.mois,
    ordre: e.ordre,
    montantDu: e.montantDu,
    nonDueSortie: e.nonDueSortie,
    paye: e.lignesPaiement.reduce((s, l) => s + l.montant, 0),
    lignesNonAnnulees: e.lignesPaiement.length,
    anneeDebut: e.inscription.anneeScolaire.anneeDebut,
    anneeLibelle: e.inscription.anneeScolaire.libelle,
    droitsEnTranches: e.inscription.droitsEnTranches,
    libelle: libelleEcheance(e, e.inscription.droitsEnTranches),
  };
}

/**
 * Échéances de l'étudiant, payé = lignes des paiements non annulés, dans l'ordre de solde.
 * Sans `avecNonDues`, les échéances « non dues » après une sortie sont exclues (reste dû, répartition, guichet).
 */
export async function echeancesEtudiant(
  client: Tx,
  etudiantId: string,
  options: { avecNonDues?: boolean } = {},
): Promise<EcheanceDossier[]> {
  const lignes = await client.echeance.findMany({
    where: { inscription: { etudiantId }, ...(options.avecNonDues ? {} : { nonDueSortie: false }) },
    select: SELECT_ECHEANCE_DOSSIER,
  });
  return trierPourSolde(lignes.map(echeanceDossier));
}

/** Échéances dues (hors « non dues » après sortie) de plusieurs étudiants en une requête, par étudiant, dans l'ordre de solde. */
export async function echeancesDesEtudiants(
  client: Tx,
  etudiants: Prisma.EtudiantWhereInput,
): Promise<Map<string, EcheanceDossier[]>> {
  const lignes = await client.echeance.findMany({
    where: { nonDueSortie: false, inscription: { etudiant: etudiants } },
    select: SELECT_ECHEANCE_DOSSIER,
  });
  const parEtudiant = new Map<string, EcheanceDossier[]>();
  for (const l of lignes) {
    const liste = parEtudiant.get(l.inscription.etudiantId) ?? [];
    liste.push(echeanceDossier(l));
    parEtudiant.set(l.inscription.etudiantId, liste);
  }
  for (const [id, liste] of parEtudiant) parEtudiant.set(id, trierPourSolde(liste));
  return parEtudiant;
}

/** Forme partagée avec le poste hors ligne (`construireSituationGuichet`, copie du guichet). */
export function echeanceCopie(e: EcheanceDossier): EcheanceCopie {
  return {
    id: e.id,
    anneeDebut: e.anneeDebut,
    anneeLibelle: e.anneeLibelle,
    type: e.type,
    tranche: e.tranche,
    droitsEnTranches: e.droitsEnTranches,
    mois: jourDeDate(e.mois),
    ordre: e.ordre,
    montantDu: e.montantDu,
    paye: e.paye,
  };
}

/**
 * Restes par étudiant, en SQL, mêmes règles que `situation()` : payé = paiements non annulés,
 * en retard si `mois < limite` (`dateLimiteRetard`), mois en retard comptés une fois par mois,
 * échéances « non dues » après une sortie exclues. `etudiantIds` null : tous les étudiants (filtres « en retard »).
 */
export function sqlRestes(limite: Date, etudiantIds: string[] | null): Prisma.Sql {
  const filtre = etudiantIds
    ? Prisma.sql`WHERE NOT ec."nonDueSortie" AND i."etudiantId" = ANY(${etudiantIds})`
    : Prisma.sql`WHERE NOT ec."nonDueSortie"`;
  // Comparée en date pure : un Date passé tel quel dépendrait du fuseau de la session Postgres.
  const jourLimite = Prisma.sql`${limite.toISOString().slice(0, 10)}::date`;
  return Prisma.sql`
    SELECT x."etudiantId",
      COALESCE(SUM(GREATEST(x.reste, 0)), 0)::int AS "resteDu",
      COALESCE(SUM(GREATEST(x.reste, 0)) FILTER (WHERE x.mois < ${jourLimite}), 0)::int AS "resteEnRetard",
      (COUNT(DISTINCT x.mois) FILTER (WHERE x.mois < ${jourLimite} AND x.reste > 0))::int AS "moisEnRetard",
      COALESCE(ARRAY_AGG(DISTINCT x.libelle ORDER BY x.libelle) FILTER (WHERE x.mois < ${jourLimite} AND x.reste > 0), '{}') AS "anneesEnRetard"
    FROM (
      SELECT i."etudiantId", ec.mois, a.libelle,
        ec."montantDu" - COALESCE(SUM(pl.montant) FILTER (WHERE NOT p.annule), 0) AS reste
      FROM echeance ec
      JOIN inscription i ON i.id = ec."inscriptionId"
      JOIN annee_scolaire a ON a.id = i."anneeScolaireId"
      LEFT JOIN paiement_ligne pl ON pl."echeanceId" = ec.id
      LEFT JOIN paiement p ON p.id = pl."paiementId"
      ${filtre}
      GROUP BY ec.id, i."etudiantId", a.libelle
    ) x
    GROUP BY x."etudiantId"`;
}

export type Restes = { resteDu: number; resteEnRetard: number; moisEnRetard: number; anneesEnRetard: string[] };

const RESTES_NULS: Restes = { resteDu: 0, resteEnRetard: 0, moisEnRetard: 0, anneesEnRetard: [] };

export async function restesParEtudiant(etudiantIds: string[], limite: Date): Promise<Map<string, Restes>> {
  if (etudiantIds.length === 0) return new Map();
  const lignes = await db.$queryRaw<(Restes & { etudiantId: string })[]>(sqlRestes(limite, etudiantIds));
  return new Map(lignes.map(({ etudiantId, ...r }) => [etudiantId, r]));
}

export function restesDe(restes: Map<string, Restes>, etudiantId: string): Restes {
  return restes.get(etudiantId) ?? RESTES_NULS;
}

/**
 * Inscription la plus récente de chaque étudiant (niveau « courant »), en sous-requête latérale sur `e`.
 * Colonnes : niveau, redoublement, "anneeLibelle", "anneeDebut".
 */
export const sqlDerniereInscription = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT i.niveau, i.redoublement, a.libelle AS "anneeLibelle", a."anneeDebut"
    FROM inscription i JOIN annee_scolaire a ON a.id = i."anneeScolaireId"
    WHERE i."etudiantId" = e.id
    ORDER BY a."anneeDebut" DESC LIMIT 1
  ) ins ON true`;

/** Chaque mot doit figurer dans `etudiant.recherche` ; `%` et `_` saisis restent littéraux. */
export function sqlMotsRecherche(mots: string[]): Prisma.Sql[] {
  return mots.map((m) => Prisma.sql`e.recherche LIKE ${`%${m.replace(/[\\%_]/g, "\\$&")}%`}`);
}
