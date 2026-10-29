// Partagé entre le formulaire (client) et l'action serveur.
export const OBJETS_CONTACT = [
  "Renseignements sur les inscriptions",
  "Frais de scolarité",
  "Filière Infirmier(e)s",
  "Filière Sage-femmes",
  "Autre demande",
] as const;

/** Destinataire du formulaire de contact quand `CONTACT_DESTINATAIRE` n'est pas défini. */
export const DESTINATAIRE_CONTACT = "admin@ifspa.mg";

/** Copies : chaque adresse une seule fois, sans le destinataire principal (comparaison sans casse). */
export function copiesContact(destinataire: string, adresses: readonly string[]): string[] {
  const vues = new Set([destinataire.trim().toLowerCase()]);
  const copies: string[] = [];
  for (const brute of adresses) {
    const adresse = brute.trim().toLowerCase();
    if (!adresse || vues.has(adresse)) continue;
    vues.add(adresse);
    copies.push(adresse);
  }
  return copies;
}
