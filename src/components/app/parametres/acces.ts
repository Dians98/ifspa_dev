import "server-only";
import { getSession, roleDe } from "@/lib/permissions";

/**
 * Le layout affiche déjà le panneau « Accès réservé » au secrétariat, mais chaque page doit
 * aussi s'arrêter avant toute lecture : les pages et le layout se rendent en parallèle.
 */
export async function estAdministrateur(): Promise<boolean> {
  const session = await getSession();
  return session !== null && roleDe(session) === "admin";
}
