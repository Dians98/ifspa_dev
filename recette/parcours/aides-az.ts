import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { montantRegex } from "./aides";
import { remplirInscription, type Inscrit } from "./aides-inscription";

// Gestes communs du parcours A-Z (recette/PARCOURS-A-Z.md). Tout passe par l'interface.

export const DOSSIER = "parcours-a-z";

/** État du navigateur du guichet (session, copie hors ligne, numéro de poste), repris d'un acte à l'autre comme Diano avec son navigateur. */
export const POSTE_GUICHET = path.resolve(__dirname, "../../playwright/.auth/az-poste-secretariat.json");

/** Les cinq étudiants du fil, inscrits dans cet ordre (d'où leurs matricules). */
export const A = {
  nom: "RAKOTOMALALA",
  prenoms: "Voahirana",
  sexe: "Féminin",
  naissance: "2005-03-14",
  lieu: "Toamasina",
  telephone: "034 00 000 01",
  adresse: "Lot II B 12, Tanambao V, Toamasina",
  filiere: "IF",
  matricule: "IF-2025-0001",
} as const satisfies Inscrit;

export const B = {
  nom: "RASOANAIVO",
  prenoms: "Fanja",
  sexe: "Féminin",
  naissance: "2004-11-02",
  lieu: "Brickaville",
  telephone: "034 00 000 02",
  adresse: "Lot 45, Ampasimazava, Toamasina",
  filiere: "IF",
  matricule: "IF-2025-0002",
  tranches: 3,
} as const satisfies Inscrit;

export const C = {
  nom: "RAZAFINDRAKOTO",
  prenoms: "Mialy",
  sexe: "Féminin",
  naissance: "2005-01-30",
  lieu: "Toamasina",
  telephone: "034 00 000 03",
  adresse: "Lot 102, Ankirihiry, Toamasina",
  filiere: "SF",
  matricule: "SF-2025-0001",
} as const satisfies Inscrit;

export const D = {
  nom: "ANDRIANARISOA",
  prenoms: "Tiana",
  sexe: "Masculin",
  naissance: "2005-07-21",
  lieu: "Fenerive-Est",
  telephone: "034 00 000 04",
  adresse: "Lot 8, Morarano, Toamasina",
  filiere: "IF",
  matricule: "IF-2025-0003",
} as const satisfies Inscrit;

export const E = {
  nom: "RAKOTOARISOA",
  prenoms: "Nirina",
  sexe: "Masculin",
  naissance: "2006-02-11",
  lieu: "Toamasina",
  telephone: "034 00 000 05",
  adresse: "Lot 19, Ampasimazava, Toamasina",
  filiere: "IF",
  matricule: "IF-2026-0001",
} as const satisfies Inscrit;

export const nomComplet = (e: { nom: string; prenoms: string }) => `${e.nom} ${e.prenoms}`;

/** Inscrit un étudiant avec le formulaire ; rend la fiche ouverte. */
export async function inscrireAZ(page: Page, e: Inscrit) {
  await remplirInscription(page, e);
  await expect(page.getByText(e.matricule, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Inscrire l'étudiant" }).click();
  await page.waitForURL(/\/app\/etudiants\/[^/]+\?nouveau=1/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(e.nom);
  await expect(page.getByText(`Étudiant inscrit sous le matricule ${e.matricule}`)).toBeVisible();
}

/** Ouvre la fiche d'un étudiant depuis la liste (recherche par matricule). */
export async function ouvrirFiche(page: Page, e: { nom: string; matricule: string }) {
  await page.goto(`/app/etudiants?q=${encodeURIComponent(e.matricule)}`);
  await page.getByRole("link", { name: new RegExp(e.nom) }).first().click();
  await page.waitForURL(/\/app\/etudiants\/[^/?]+(\?.*)?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(e.nom);
}

/** Résumé « Reste à payer / Dont en retard / Déjà payé » de la fiche. */
export const resume = (page: Page, libelle: "Reste à payer" | "Dont en retard" | "Déjà payé"): Locator =>
  page.locator("dt", { hasText: libelle }).locator("xpath=following-sibling::dd[1]");

export { montantRegex };
