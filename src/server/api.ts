import "server-only";
import type { ErreurApi } from "@/lib/encaissement-hors-ligne";
import { MESSAGE_ECHEC_GENERIQUE } from "@/server/erreurs";

// Réponses des routes de l'encaissement hors ligne : toujours du JSON, jamais en cache, jamais de redirection.

export function reponseJson(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { "Cache-Control": "no-store" } });
}

export function erreurApi(erreur: string, code: ErreurApi["code"], status: number): Response {
  return reponseJson({ erreur, code } satisfies ErreurApi, status);
}

/** Erreur inattendue : 500 JSON sans détail technique, le détail part dans les journaux du serveur. */
export async function avecErreurJson(traiter: () => Promise<Response>): Promise<Response> {
  try {
    return await traiter();
  } catch (e) {
    console.error(e);
    return erreurApi(MESSAGE_ECHEC_GENERIQUE, "ERREUR", 500);
  }
}

/** Corps JSON d'une requête, ou undefined s'il est absent ou illisible (le schéma zod le refusera). */
export async function lireCorpsJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
