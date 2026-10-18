import type { ReponseCopie } from "@/lib/encaissement-hors-ligne";
import { exigerSessionApi } from "@/server/acces";
import { avecErreurJson, reponseJson } from "@/server/api";
import { copieGuichet } from "@/server/lectures/copie-guichet";

export const runtime = "nodejs";

/** Copie légère du guichet pour Encaisser hors ligne (IndexedDB du poste). */
export function GET(): Promise<Response> {
  return avecErreurJson(async () => {
    const { session, refus } = await exigerSessionApi();
    if (refus) return refus;
    const copie = await copieGuichet(new Date());
    const corps: ReponseCopie = { ...copie, utilisateur: { id: session.user.id, nom: session.user.name } };
    return reponseJson(corps);
  });
}
