import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { StatutEtudiant, TypeEcheance } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { libelleEcheance, trierPourSolde, type EcheancePayee } from "@/lib/ecolage";

type Tx = Prisma.TransactionClient;

/** Base cPanel parfois lente : on laisse du temps aux transactions interactives. */
export const OPTIONS_TRANSACTION = { timeout: 15_000, maxWait: 10_000 } as const;

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
};

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
    select: {
      id: true,
      inscriptionId: true,
      type: true,
      tranche: true,
      mois: true,
      ordre: true,
      montantDu: true,
      nonDueSortie: true,
      inscription: { select: { droitsEnTranches: true, anneeScolaire: { select: { anneeDebut: true, libelle: true } } } },
      lignesPaiement: { where: { paiement: { annule: false } }, select: { montant: true } },
    },
  });
  return trierPourSolde(
    lignes.map((e) => ({
      id: e.id,
      inscriptionId: e.inscriptionId,
      type: e.type,
      tranche: e.tranche,
      mois: e.mois,
      ordre: e.ordre,
      montantDu: e.montantDu,
      nonDueSortie: e.nonDueSortie,
      paye: e.lignesPaiement.reduce((s, l) => s + l.montant, 0),
      anneeDebut: e.inscription.anneeScolaire.anneeDebut,
      anneeLibelle: e.inscription.anneeScolaire.libelle,
      droitsEnTranches: e.inscription.droitsEnTranches,
      libelle: libelleEcheance(e, e.inscription.droitsEnTranches),
    })),
  );
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
