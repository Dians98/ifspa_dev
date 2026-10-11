import "server-only";
import type { Session } from "@/lib/auth";
import { echec, type EtatErreur } from "@/lib/etat-action";
import { ErreurPermission, requireRole } from "@/lib/permissions";

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
