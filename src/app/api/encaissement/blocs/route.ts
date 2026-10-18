import { jourMadagascar } from "@/lib/dates";
import { schemaDemandeBlocs, type ReponseBlocs } from "@/lib/encaissement-hors-ligne";
import { exigerSessionApi } from "@/server/acces";
import { avecErreurJson, erreurApi, lireCorpsJson, reponseJson } from "@/server/api";
import { rechargerBlocsPoste } from "@/server/blocs-recus";

export const runtime = "nodejs";

/** Recharge les blocs de numéros de reçu du poste pour l'utilisateur connecté ; à appeler après l'envoi de la file. */
export function POST(request: Request): Promise<Response> {
  return avecErreurJson(async () => {
    const { session, refus } = await exigerSessionApi();
    if (refus) return refus;

    const lu = schemaDemandeBlocs.safeParse(await lireCorpsJson(request));
    if (!lu.success) return erreurApi(lu.error.issues[0]?.message ?? "Données invalides.", "INVALIDE", 400);

    const maintenant = new Date();
    try {
      const etat = await rechargerBlocsPoste(session.user.id, lu.data.poste, jourMadagascar(maintenant));
      const corps: ReponseBlocs = { ...etat, serveurISO: maintenant.toISOString() };
      return reponseJson(corps);
    } catch (e) {
      // Plus de 99 999 reçus dans l'année : rien n'a été réservé.
      if (e instanceof RangeError) return erreurApi(e.message, "NUMEROS_EPUISES", 409);
      throw e;
    }
  });
}
