import {
  schemaElementFile,
  schemaSynchronisation,
  type ElementFile,
  type ReponseSynchronisation,
  type ResultatElementSynchro,
} from "@/lib/encaissement-hors-ligne";
import { exigerSessionApi } from "@/server/acces";
import { avecErreurJson, erreurApi, lireCorpsJson, reponseJson } from "@/server/api";
import { revaliderPagesEcolage } from "@/server/ecolage-revalidation";
import { designationPaiement, synchroniserPaiement } from "@/server/paiements";

export const runtime = "nodejs";

const MESSAGE_AUTEUR = "Saisi par un autre compte : il sera envoyé à sa prochaine connexion sur ce poste.";

function idClientDe(brut: unknown): string {
  const v = (brut as { idClient?: unknown } | null)?.idClient;
  return typeof v === "string" ? v.slice(0, 64) : "";
}

/** Envoie la file d'attente du poste : chaque élément est traité seul, du plus ancien au plus récent. */
export function POST(request: Request): Promise<Response> {
  return avecErreurJson(async () => {
    const { session, refus } = await exigerSessionApi();
    if (refus) return refus;

    const corps = schemaSynchronisation.safeParse(await lireCorpsJson(request));
    if (!corps.success) return erreurApi(corps.error.issues[0]?.message ?? "Données invalides.", "INVALIDE", 400);

    const recuLe = new Date();
    const resultats: ResultatElementSynchro[] = [];
    const valides: ElementFile[] = [];
    for (const brut of corps.data.elements) {
      const lu = schemaElementFile.safeParse(brut);
      if (!lu.success) {
        const message = lu.error.issues[0]?.message ?? "Données invalides.";
        resultats.push({
          idClient: idClientDe(brut),
          statut: "refuse",
          message: `${await designationPaiement(brut)} : paiement illisible, ${message}`,
          code: "INVALIDE",
        });
      } else if (lu.data.saisiParId !== session.user.id) {
        // Décision 36 : seul l'auteur envoie son paiement ; rien n'est enregistré.
        resultats.push({ idClient: lu.data.idClient, statut: "refuse", message: `${await designationPaiement(lu.data)} : ${MESSAGE_AUTEUR}`, code: "AUTEUR" });
      } else {
        valides.push(lu.data);
      }
    }

    // Ordre de saisie : deux paiements du même étudiant sont imputés comme sur le poste.
    valides.sort((a, b) => Date.parse(a.instantSaisie) - Date.parse(b.instantSaisie));
    for (const element of valides) resultats.push(await synchroniserPaiement({ ...element, recuLe }));

    if (resultats.some((r) => r.statut === "enregistre")) revaliderPagesEcolage();
    const reponse: ReponseSynchronisation = { resultats, serveurISO: new Date().toISOString() };
    return reponseJson(reponse);
  });
}
