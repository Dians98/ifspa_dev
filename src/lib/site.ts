// Adresse publique du site, figée au build (voir la phase 8 de docs/PLAN.md : le .env de build porte le vrai domaine).
export const URL_SITE = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100").replace(/\/$/, "");

export const TITRE_SITE = "IFSPA Toamasina — Institut paramédical agréé : Infirmier(e)s et Sage-femmes";
export const DESCRIPTION_SITE =
  "Institut de Formation Supérieur des Paramédicaux Atsinanana (IFSPA), établissement supérieur privé de Toamasina agréé par le ministère de l'Enseignement supérieur depuis 2011 : filières Infirmier(e)s et Sage-femmes.";
