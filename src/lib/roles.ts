// Rôles et chemins partagés entre le serveur, le proxy et les composants client.

export type Role = "admin" | "user";

export const LIBELLE_ROLE: Record<Role, string> = {
  admin: "Administrateur",
  user: "Secrétariat",
};

export const CHEMIN_CONNEXION = "/connexion";
export const CHEMIN_ACCUEIL_APP = "/app/dashboard";

/** Destination après connexion : uniquement un chemin interne de l'application, sinon l'accueil. */
export function destinationApresConnexion(retour: string | null | undefined): string {
  if (!retour || retour.includes("\\")) return CHEMIN_ACCUEIL_APP;
  const interne = retour === "/app" || retour.startsWith("/app/") || retour.startsWith("/app?");
  return interne ? retour : CHEMIN_ACCUEIL_APP;
}
