import "server-only";
import type { Session } from "@/lib/auth";
import { echec, type EtatErreur } from "@/lib/etat-action";
import { ErreurPermission, getSession, requireRole, requireSession, roleDe } from "@/lib/permissions";
import { erreurApi } from "@/server/api";

const RESERVE_ADMIN = new ErreurPermission().message;

/**
 * Session d'une route API, rôles `user` et `admin` : `/api` échappe au proxy et une redirection
 * casserait le `fetch` du poste, d'où un 401 JSON `{ erreur, code: "SESSION" }`.
 */
export async function exigerSessionApi(): Promise<{ session: Session; refus: null } | { session: null; refus: Response }> {
  const session = await getSession();
  if (!session) return { session: null, refus: erreurApi("Session expirée : reconnectez-vous.", "SESSION", 401) };
  return { session, refus: null };
}

/** Route API réservée à l'administrateur : 401 sans session, 403 `{ code: "INTERDIT" }` pour le rôle `user`. */
export async function exigerAdminApi(): Promise<{ session: Session; refus: null } | { session: null; refus: Response }> {
  const acces = await exigerSessionApi();
  if (acces.refus) return acces;
  if (roleDe(acces.session) !== "admin") return { session: null, refus: erreurApi(RESERVE_ADMIN, "INTERDIT", 403) };
  return acces;
}

/**
 * En tête de chaque page et layout de /app, avant toute lecture : une navigation client ne rejoue pas
 * les layouts déjà affichés, seule la page est rendue. Sans session valide, renvoie vers la connexion.
 */
export async function exigerSessionPage(): Promise<{ session: Session; admin: boolean }> {
  const session = await requireSession();
  return { session, admin: roleDe(session) === "admin" };
}

/** Session de toute action de l'espace connecté ; sans session, renvoie vers la connexion. */
export async function exigerSession(): Promise<Session> {
  return requireSession();
}

type Acces = { session: Session; refus: null } | { session: null; refus: EtatErreur };

/**
 * `requireRole("admin")` pour une Server Action : le refus revient dans l'état au lieu d'être levé,
 * car Next.js masque le message des erreurs levées en production.
 */
export async function exigerAdmin(): Promise<Acces> {
  try {
    return { session: await requireRole("admin"), refus: null };
  } catch (e) {
    if (e instanceof ErreurPermission) return { session: null, refus: echec(e.message) };
    throw e;
  }
}
