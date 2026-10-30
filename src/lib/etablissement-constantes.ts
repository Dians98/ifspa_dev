// Faits officiels, repris tels quels du document « LOGO ET ARRËTEE IFSPA.pdf » (arrêtés)
// et de la fiche « DAF.pdf » remplie par l'institut le 29/10/2026 (coordonnées, devise, présentation, filières).
// Sans `server-only` : le ticket de caisse, rendu dans le navigateur, les affiche aussi.

export const ETABLISSEMENT = {
  nom: "Institut de Formation Supérieur des Paramédicaux Atsinanana",
  sigle: "IFSPA",
  ville: "Toamasina",
  /** Ancien nom de la ville, encore très employé dans les recherches. */
  villeAutreNom: "Tamatave",
  region: "Atsinanana",
  pays: "Madagascar",
  domaine: "Science de la Santé",
  anneeFondation: 2008,
} as const;

/** « Toamasina (Tamatave) » pour la ville officielle ; une autre ville saisie en base reste telle quelle. */
export function villeAvecAutreNom(ville: string) {
  return ville === ETABLISSEMENT.ville ? `${ville} (${ETABLISSEMENT.villeAutreNom})` : ville;
}

export const DEVISE: string | null = "Foi – Civisme – Performance";

/** Coordonnées publiques ; une valeur saisie en base (table `etablissement`) l'emporte. */
export const COORDONNEES = {
  adresse: "Plle 32/32, Station FJKM David Jones",
  /** Repère pour trouver l'institut. */
  acces: "Dans l'enceinte du Lycée FJKM David Jones",
  telephone: "034 07 576 81",
  email: "ifspagerardolivier@gmail.com",
  /** Seconde adresse publique, affichée après la première. */
  emailAdmin: "admin@ifspa.mg",
  horaires: ["8 h – 11 h 30", "14 h – 16 h 30"],
  facebook: "IFSPA Toamasina",
  facebookUrl: "https://www.facebook.com/profile.php?id=61565939902024",
} as const;

/** Commun aux deux filières (fiche DAF.pdf). */
export const ETUDES = {
  dureeAnnees: 3,
  admission: "Baccalauréat série A, C ou D",
  deroulement:
    "Cours théoriques et stages pratiques, d'abord sur modèles anatomiques, puis auprès des patients.",
} as const;

/**
 * Chiffres clés de la landing. `valeur: null` : un tiret s'affiche à la place du chiffre.
 * ⚠️ Valeurs PROVISOIRES posées en attendant les chiffres de l'institut : à remplacer avant la mise en ligne.
 */
export type ChiffreCle = {
  nature: "etudiants" | "insertion" | "partenaires";
  valeur: number | null;
  libelle: string;
  precision: string | null;
};

export const CHIFFRES_CLES: readonly ChiffreCle[] = [
  { nature: "etudiants", valeur: 1200, libelle: "étudiants", precision: null },
  { nature: "insertion", valeur: 92, libelle: "d'insertion professionnelle", precision: null },
  { nature: "partenaires", valeur: 15, libelle: "partenaires", precision: null },
];

export const ARRETES = [
  {
    reference: "N° 04460/2011-MESupRes",
    annee: 2011,
    objet: "Autorisation d'ouverture de l'établissement supérieur privé IFSPA.",
  },
  {
    reference: "N° 15482/2011-MESupRES",
    annee: 2011,
    objet: "Habilitation de la formation dispensée, dans le domaine « Science de la Santé ».",
  },
  {
    reference: "N° 23915/2011 CNEAT",
    annee: 2011,
    objet: "Détermination de l'équivalence administrative du titre dans la Fonction publique.",
  },
  {
    reference: "N° 056/2024/MESupRes/SG/DGES/SG",
    annee: 2024,
    objet: "Attestation de renouvellement du 3 avril 2024.",
  },
] as const;

const [OUVERTURE, HABILITATION, , RENOUVELLEMENT] = ARRETES;

/** Pied du ticket 58/80 mm : ouverture, habilitation et renouvellement, références abrégées pour tenir sur le rouleau. */
export const MENTION_AGREMENT_TICKET = `Établissement agréé · arrêtés ${OUVERTURE.reference.replace("N°", "n°")} et ${HABILITATION.reference.replace("N°", "n°")} · renouvellement ${RENOUVELLEMENT.reference.replace("N°", "n°").split("/").slice(0, 2).join("/")}`;
