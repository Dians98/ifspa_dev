import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { echeanceFrais, type EcheanceGeneree } from "@/lib/ecolage";
import { STATUTS_SANS_NOUVEAU_FRAIS } from "@/lib/frais";

type Tx = Prisma.TransactionClient;

export function cleClasse(filiereId: string, niveau: number): string {
  return `${filiereId}:${niveau}`;
}

/**
 * Échéances FRAIS à copier sur les inscriptions créées maintenant dans l'année, par classe (`cleClasse`).
 * À lire après le verrou FOR SHARE de l'année : un frais créé en parallèle (FOR UPDATE) attend, ou est déjà visible.
 */
export async function echeancesFraisParClasse(tx: Tx, anneeScolaireId: string): Promise<Map<string, EcheanceGeneree[]>> {
  const frais = await tx.frais.findMany({
    where: { anneeScolaireId },
    orderBy: { rang: "asc" },
    select: { id: true, montant: true, mois: true, classes: { select: { filiereId: true, niveau: true } } },
  });
  const parClasse = new Map<string, EcheanceGeneree[]>();
  for (const f of frais) {
    for (const c of f.classes) {
      const cle = cleClasse(c.filiereId, c.niveau);
      parClasse.set(cle, [...(parClasse.get(cle) ?? []), echeanceFrais(f)]);
    }
  }
  return parClasse;
}

/** Inscriptions de l'année dans ces classes, redoublants compris, étudiants sortis ou diplômés exclus. */
export async function inscriptionsConcernees(
  tx: Tx,
  anneeScolaireId: string,
  classes: readonly { filiereId: string; niveau: number }[],
): Promise<{ id: string; etudiantId: string }[]> {
  if (classes.length === 0) return [];
  return tx.inscription.findMany({
    where: {
      anneeScolaireId,
      etudiant: { statut: { notIn: [...STATUTS_SANS_NOUVEAU_FRAIS] } },
      OR: classes.map((c) => ({ niveau: c.niveau, etudiant: { filiereId: c.filiereId } })),
    },
    orderBy: { etudiantId: "asc" },
    select: { id: true, etudiantId: true },
  });
}

/** Ordre commun aux écritures d'écolage : étudiants puis leurs échéances, par id croissant. */
export async function verrouillerEtudiants(tx: Tx, etudiantIds: readonly string[]): Promise<void> {
  if (etudiantIds.length === 0) return;
  const ids = [...new Set(etudiantIds)];
  await tx.$queryRaw`SELECT id FROM etudiant WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
  await tx.$queryRaw`
    SELECT ec.id FROM echeance ec JOIN inscription i ON i.id = ec."inscriptionId"
    WHERE i."etudiantId" = ANY(${ids}) ORDER BY ec.id FOR UPDATE OF ec`;
}

/** Échéances FRAIS d'une seule classe ; mêmes conditions de verrou que `echeancesFraisParClasse`. */
export async function echeancesFraisPour(
  tx: Tx,
  anneeScolaireId: string,
  filiereId: string,
  niveau: number,
): Promise<EcheanceGeneree[]> {
  return (await echeancesFraisParClasse(tx, anneeScolaireId)).get(cleClasse(filiereId, niveau)) ?? [];
}
