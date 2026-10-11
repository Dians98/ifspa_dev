import "server-only";
import { db } from "@/lib/db";
import { controleActionUtilisateur, type ActionUtilisateur } from "@/lib/parametres";
import { requireRole } from "@/lib/permissions";
import { LIBELLE_ROLE, type Role } from "@/lib/roles";

export type UtilisateurParametre = {
  id: string;
  nom: string;
  email: string;
  role: Role;
  libelleRole: string;
  /** false : compte désactivé (banni par le plugin admin), connexion refusée. */
  actif: boolean;
  /**
   * Ouverture de la session la plus récente encore en base (ISO), null si aucune.
   * Approximation : une session fermée (déconnexion, expiration) disparaît de la base.
   */
  derniereConnexion: string | null;
  estMoi: boolean;
  /** Pour chaque action : null si permise, sinon la raison affichable. `changerRole` = passer à l'autre rôle. */
  refus: Record<ActionUtilisateur, string | null>;
};

/** Réservée à l'administrateur : lève `ErreurPermission` sinon (la page appelle déjà `requireAdminPage()`). */
export async function lireUtilisateurs(): Promise<UtilisateurParametre[]> {
  const session = await requireRole("admin");
  const utilisateurs = await db.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  const estAdmin = (role: string | null) => role === "admin";
  const adminsActifs = utilisateurs.filter((u) => estAdmin(u.role) && u.banned !== true).length;

  return utilisateurs.map((u) => {
    const role: Role = estAdmin(u.role) ? "admin" : "user";
    const contexte = {
      acteurId: session.user.id,
      cibleId: u.id,
      cibleEstAdmin: role === "admin",
      cibleActive: u.banned !== true,
      adminsActifs,
    };
    return {
      id: u.id,
      nom: u.name,
      email: u.email,
      role,
      libelleRole: LIBELLE_ROLE[role],
      actif: u.banned !== true,
      derniereConnexion: u.sessions[0]?.createdAt.toISOString() ?? null,
      estMoi: u.id === session.user.id,
      refus: {
        changerRole: controleActionUtilisateur({
          ...contexte,
          action: "changerRole",
          nouveauRole: role === "admin" ? "user" : "admin",
        }),
        desactiver: controleActionUtilisateur({ ...contexte, action: "desactiver" }),
        reactiver: controleActionUtilisateur({ ...contexte, action: "reactiver" }),
        reinitialiserMotDePasse: controleActionUtilisateur({ ...contexte, action: "reinitialiserMotDePasse" }),
      },
    };
  });
}
