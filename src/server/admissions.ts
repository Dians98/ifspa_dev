import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { anneesDuPassage, controleAnnulation, type AnneesPassage, type ContexteAnnulation, type LigneRestauration } from "@/lib/admissions";

// Fonctions appelées aussi avec un client de transaction : requêtes en séquence, jamais en Promise.all
// (une transaction n'a qu'une connexion).
type Client = Prisma.TransactionClient;

/** Années source et cible du passage, déduites des inscriptions en cours. */
export async function passageCourant(client: Client): Promise<AnneesPassage> {
  const annees = await client.anneeScolaire.findMany({
    select: { id: true, libelle: true, anneeDebut: true, moisDebutEcolage: true, estCourante: true, cloturee: true },
  });
  const enCours = await client.$queryRaw<{ anneeId: string; n: number }[]>`
    SELECT i."anneeScolaireId" AS "anneeId", COUNT(*)::int AS n
    FROM inscription i JOIN etudiant e ON e.id = i."etudiantId"
    WHERE i.statut = 'EN_COURS' AND e.statut = 'ACTIF'
    GROUP BY i."anneeScolaireId"`;
  return anneesDuPassage(annees, new Map(enCours.map((l) => [l.anneeId, l.n])));
}

export type DossierAnnulation = {
  contexte: ContexteAnnulation;
  lignes: LigneRestauration[];
  /** null si l'annulation est permise, sinon la raison affichable. */
  refus: string | null;
  /** Reçus (annulés compris) qui bloquent définitivement l'annulation, par numéro. */
  recusBloquants: RecuBloquant[];
};

export type RecuBloquant = { id: string; numeroRecu: string };

/** Tout ce qu'il faut pour décider de l'annulation de chaque opération, en un nombre fixe de requêtes. */
export async function dossiersAnnulation(client: Client, operationIds: string[]): Promise<Map<string, DossierAnnulation>> {
  if (operationIds.length === 0) return new Map();
  const operations = await client.operationAdmission.findMany({
    where: { id: { in: operationIds } },
    select: {
      id: true,
      annulee: true,
      lignes: {
        select: {
          etudiantId: true,
          decision: true,
          inscriptionSourceId: true,
          inscriptionCibleId: true,
          ancienStatutInscription: true,
          ancienStatutEtudiant: true,
          ancienneDateSortie: true,
          ancienMotifSortie: true,
          etudiant: { select: { nom: true, prenoms: true, statut: true } },
        },
      },
    },
  });
  const lignes = operations.flatMap((o) => o.lignes);
  const cibles = lignes.flatMap((l) => (l.inscriptionCibleId ? [l.inscriptionCibleId] : []));
  const inscriptions = await client.inscription.findMany({
    where: { id: { in: [...new Set([...lignes.map((l) => l.inscriptionSourceId), ...cibles])] } },
    select: { id: true, statut: true },
  });
  // Lignes de paiements annulés comprises : supprimer leurs échéances effacerait l'historique du reçu.
  const recus = cibles.length
    ? await client.$queryRaw<{ inscriptionId: string; paiementId: string; numeroRecu: string }[]>`
        SELECT DISTINCT ec."inscriptionId", p.id AS "paiementId", p."numeroRecu"
        FROM paiement_ligne pl
        JOIN echeance ec ON ec.id = pl."echeanceId"
        JOIN paiement p ON p.id = pl."paiementId"
        WHERE ec."inscriptionId" = ANY(${cibles})
        ORDER BY p."numeroRecu"`
    : [];
  const reprises = await client.ligneAdmission.findMany({
    where: { inscriptionSourceId: { in: cibles }, operation: { annulee: false } },
    select: { inscriptionSourceId: true },
  });
  const statuts = new Map(inscriptions.map((i) => [i.id, i.statut]));
  const ciblesReprises = new Set(reprises.map((r) => r.inscriptionSourceId));

  return new Map(
    operations.map((o) => {
      const ciblesOp = new Set(o.lignes.flatMap((l) => (l.inscriptionCibleId ? [l.inscriptionCibleId] : [])));
      const recusBloquants = new Map<string, RecuBloquant>();
      for (const r of recus) {
        if (ciblesOp.has(r.inscriptionId)) recusBloquants.set(r.paiementId, { id: r.paiementId, numeroRecu: r.numeroRecu });
      }
      const contexte: ContexteAnnulation = {
        annulee: o.annulee,
        lignes: o.lignes.map((l) => ({
          etudiantId: l.etudiantId,
          nom: l.etudiant.nom,
          prenoms: l.etudiant.prenoms,
          decision: l.decision,
          ancienStatutEtudiant: l.ancienStatutEtudiant,
          inscriptionCibleId: l.inscriptionCibleId,
          statutEtudiantActuel: l.etudiant.statut,
          statutInscriptionSourceActuel: statuts.get(l.inscriptionSourceId) ?? null,
          statutInscriptionCibleActuel: l.inscriptionCibleId ? (statuts.get(l.inscriptionCibleId) ?? null) : null,
        })),
        recus: [...recusBloquants.values()].map((r) => r.numeroRecu).sort(),
        ciblesReprises,
      };
      const restauration: LigneRestauration[] = o.lignes.map((l) => ({
        etudiantId: l.etudiantId,
        decision: l.decision,
        inscriptionSourceId: l.inscriptionSourceId,
        inscriptionCibleId: l.inscriptionCibleId,
        ancienStatutInscription: l.ancienStatutInscription,
        ancienStatutEtudiant: l.ancienStatutEtudiant,
        ancienneDateSortie: l.ancienneDateSortie,
        ancienMotifSortie: l.ancienMotifSortie,
      }));
      return [
        o.id,
        {
          contexte,
          lignes: restauration,
          refus: controleAnnulation(contexte),
          recusBloquants: [...recusBloquants.values()].sort((a, b) => a.numeroRecu.localeCompare(b.numeroRecu)),
        },
      ];
    }),
  );
}
