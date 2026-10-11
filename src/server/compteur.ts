import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// Compteurs atomiques ("MATRICULE:IF:2026", "RECU:2026"). L'incrément verrouille la ligne jusqu'à la fin
// de la transaction : un numéro pris puis abandonné (rollback) est rendu, aucun trou ni doublon.

type Tx = Prisma.TransactionClient;

export const TAILLE_BLOC_MAX = 500;

function exigerTransaction(tx: Tx): void {
  // Le client d'une transaction interactive n'expose pas $connect (Prisma 7) : hors transaction, le verrou ne protège rien.
  if (typeof (tx as { $connect?: unknown }).$connect === "function") {
    throw new Error("Le compteur s'incrémente uniquement dans db.$transaction.");
  }
}

/** Prochaine valeur (1 pour une clé neuve). */
export async function prochainNumero(tx: Tx, cle: string): Promise<number> {
  exigerTransaction(tx);
  const [ligne] = await tx.$queryRaw<{ valeur: number }[]>`
    INSERT INTO "compteur" ("cle", "valeur") VALUES (${cle}, 1)
    ON CONFLICT ("cle") DO UPDATE SET "valeur" = "compteur"."valeur" + 1
    RETURNING "valeur"`;
  return ligne.valeur;
}

/** Réserve `taille` valeurs consécutives d'un coup (blocs de numéros des postes hors ligne). */
export async function reserverBloc(tx: Tx, cle: string, taille: number): Promise<{ premier: number; dernier: number }> {
  exigerTransaction(tx);
  if (!Number.isInteger(taille) || taille < 1 || taille > TAILLE_BLOC_MAX) {
    throw new RangeError(`Taille de bloc invalide : ${taille} (entre 1 et ${TAILLE_BLOC_MAX}).`);
  }
  const [ligne] = await tx.$queryRaw<{ valeur: number }[]>`
    INSERT INTO "compteur" ("cle", "valeur") VALUES (${cle}, ${taille})
    ON CONFLICT ("cle") DO UPDATE SET "valeur" = "compteur"."valeur" + ${taille}
    RETURNING "valeur"`;
  return { premier: ligne.valeur - taille + 1, dernier: ligne.valeur };
}
