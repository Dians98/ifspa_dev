import "server-only";
import { db } from "@/lib/db";
import { ETABLISSEMENT } from "@/lib/etablissement-constantes";

export { ARRETES, DEVISE, ETABLISSEMENT, MENTION_AGREMENT_TICKET } from "@/lib/etablissement-constantes";

/** Coordonnées modifiables (Paramètres > Établissement). Null tant qu'elles ne sont pas saisies. */
export async function getCoordonnees() {
  const e = await db.etablissement.findUnique({ where: { id: 1 } });
  return {
    adresse: e?.adresse ?? null,
    ville: e?.ville ?? ETABLISSEMENT.ville,
    telephone: e?.telephone ?? null,
    email: e?.email ?? null,
  };
}
