import "server-only";
import { db } from "@/lib/db";
import { COORDONNEES, ETABLISSEMENT } from "@/lib/etablissement-constantes";

export { ARRETES, COORDONNEES, DEVISE, ETABLISSEMENT, ETUDES, MENTION_AGREMENT_TICKET } from "@/lib/etablissement-constantes";

/** Coordonnées publiques : celles saisies en base l'emportent sur les coordonnées officielles du code. */
export async function getCoordonnees() {
  const e = await db.etablissement.findUnique({ where: { id: 1 } });
  return {
    adresse: e?.adresse ?? COORDONNEES.adresse,
    ville: e?.ville ?? ETABLISSEMENT.ville,
    telephone: e?.telephone ?? COORDONNEES.telephone,
    email: e?.email ?? COORDONNEES.email,
  };
}
