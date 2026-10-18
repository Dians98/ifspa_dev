// Adresse publique du site, figée au build (voir la phase 8 de docs/PLAN.md : le .env de build porte le vrai domaine).
export const URL_SITE = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100").replace(/\/$/, "");

export const TITRE_SITE = "IFSPA — Institut de Formation Supérieur des Paramédicaux Atsinanana";
export const DESCRIPTION_SITE =
  "Établissement supérieur privé de formation paramédicale à Toamasina : filières Infirmier(e)s et Sage-femmes, domaine « Science de la Santé ».";
