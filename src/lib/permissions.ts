import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";
import { CHEMIN_ACCUEIL_APP, CHEMIN_CONNEXION, type Role } from "@/lib/roles";

/** Levée par une Server Action quand le rôle ne suffit pas. Le message est affichable tel quel. */
export class ErreurPermission extends Error {
  constructor(message = "Cette action est réservée à l'administrateur.") {
    super(message);
    this.name = "ErreurPermission";
  }
}

/** Compte désactivé : `banned` sans échéance, ou échéance pas encore atteinte. */
export function estBanni(user: { banned?: boolean | null; banExpires?: Date | null }, maintenant: Date): boolean {
  if (!user.banned) return false;
  return !user.banExpires || user.banExpires.getTime() > maintenant.getTime();
}

/**
 * Session relue en base à chaque requête (pas de `cookieCache` dans `auth.ts`), mémorisée pour la requête.
 * Better Auth ne contrôle le bannissement qu'à la connexion : une session survivante d'un compte désactivé est refusée ici.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || estBanni(session.user, new Date())) return null;
  return session;
});

export function roleDe(session: Session): Role {
  return session.user.role === "admin" ? "admin" : "user";
}

/** Pages et actions de l'espace connecté : renvoie vers la connexion sans session valide. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(CHEMIN_CONNEXION);
  return session;
}

/** Server Actions et routes : lève `ErreurPermission` si le rôle ne correspond pas. */
export async function requireRole(role: Role): Promise<Session> {
  const session = await requireSession();
  if (role === "admin" && roleDe(session) !== "admin") throw new ErreurPermission();
  return session;
}

/** Pages réservées à l'administrateur : un `user` est renvoyé à l'accueil de l'application. */
export async function requireAdminPage(): Promise<Session> {
  const session = await requireSession();
  if (roleDe(session) !== "admin") redirect(CHEMIN_ACCUEIL_APP);
  return session;
}
