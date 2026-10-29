import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { jourMadagascar } from "@/lib/dates";
import { dateLimiteRetard } from "@/lib/ecolage";
import {
  elaguerPourCopie,
  encaissable,
  restesLocaux,
  type CopieGuichet,
  type EtudiantCopie,
} from "@/lib/encaissement-hors-ligne";
import { echeanceCopie, echeancesDesEtudiants, sqlRestes } from "@/server/ecolage";
import { SELECT_SOURCE_GUICHET, sourceGuichet } from "@/server/lectures/paiements";

/**
 * Copie légère du guichet pour le poste hors ligne : les encaissables (actifs, et sortis qui doivent encore),
 * leurs échéances élaguées par `elaguerPourCopie`, sans tarifs (décisions 38 et 39). Trois requêtes, quel que soit l'effectif.
 */
export async function copieGuichet(maintenant: Date = new Date()): Promise<CopieGuichet> {
  const jour = jourMadagascar(maintenant);
  const sortisQuiDoivent = await db.$queryRaw<{ id: string }[]>`
    SELECT e.id FROM etudiant e
    JOIN (${sqlRestes(dateLimiteRetard(jour), null)}) r ON r."etudiantId" = e.id
    WHERE e.statut <> 'ACTIF' AND r."resteDu" > 0`;
  const population: Prisma.EtudiantWhereInput = {
    OR: [{ statut: "ACTIF" }, { id: { in: sortisQuiDoivent.map((s) => s.id) } }],
  };

  const [etudiants, echeances] = await Promise.all([
    db.etudiant.findMany({ where: population, orderBy: [{ nom: "asc" }, { prenoms: "asc" }], select: SELECT_SOURCE_GUICHET }),
    echeancesDesEtudiants(db, population, jour),
  ]);

  const copie: EtudiantCopie[] = [];
  for (const e of etudiants) {
    const complet: EtudiantCopie = { ...sourceGuichet(e), echeances: (echeances.get(e.id) ?? []).map(echeanceCopie) };
    if (encaissable(complet, restesLocaux(complet.echeances, jour).resteDu)) copie.push(elaguerPourCopie(complet));
  }
  return { genereeLeISO: maintenant.toISOString(), etudiants: copie };
}
