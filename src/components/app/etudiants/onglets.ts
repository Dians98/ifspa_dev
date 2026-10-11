const ONGLETS = ["ecolage", "identite", "parcours", "paiements"] as const;
export type OngletFiche = (typeof ONGLETS)[number];

/** Hors du composant client : la page serveur l'appelle pour lire `?onglet=`. */
export function ongletValide(valeur: string | undefined): OngletFiche {
  return ONGLETS.find((o) => o === valeur) ?? "ecolage";
}
