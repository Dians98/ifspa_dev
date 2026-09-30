import "server-only";
import { db } from "@/lib/db";

// Faits officiels, repris tels quels du document « LOGO ET ARRËTEE IFSPA.pdf ».
export const ETABLISSEMENT = {
  nom: "Institut de Formation Supérieur des Paramédicaux Atsinanana",
  sigle: "IFSPA",
  ville: "Toamasina",
  region: "Atsinanana",
  domaine: "Science de la Santé",
} as const;

// Devise officielle de l'institut : à fournir par l'IFSPA (ne pas inventer).
export const DEVISE: string | null = null;

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

/** Coordonnées modifiables (Paramètres > Établissement). Null tant qu'elles ne sont pas saisies. */
export async function getCoordonnees() {
  const e = await db.etablissement.findUnique({ where: { id: 1 } });
  return {
    adresse: e?.adresse ?? null,
    ville: e?.ville ?? ETABLISSEMENT.ville,
    telephone: e?.telephone ?? null,
    email: e?.email ?? null,
  };
}
