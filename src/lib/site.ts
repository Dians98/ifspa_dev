// Adresse publique du site, figée au build (voir la phase 8 de docs/PLAN.md : le .env de build porte le vrai domaine).
export const URL_SITE = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100").replace(/\/$/, "");

// Les deux noms de la ville : on cherche autant « Tamatave » que « Toamasina ».
export const TITRE_SITE = "IFSPA Toamasina (Tamatave) — Institut paramédical agréé : Infirmier(e)s et Sage-femmes";
export const DESCRIPTION_SITE =
  "Institut de Formation Supérieur des Paramédicaux Atsinanana (IFSPA) à Toamasina (Tamatave), Madagascar : enseignement supérieur privé agréé depuis 2011, formations Infirmier(e)s et Sage-femmes en 3 ans.";
