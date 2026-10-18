import { expect, type Locator, type Page } from "@playwright/test";
import { ETUDIANTS, montantRegex } from "./aides";
import { type Inscrit } from "./aides-inscription";

// Gestes partagés par les parcours UC11 (sortie) et UC05 (liste et fiche). Section H de 00-PREPARATION.md.

export const DOSSIER_UC11 = "UC11-sortie";
export const DOSSIER_UC05 = "UC05-etudiants";

/** Étudiants de la section H, inscrits en 2026-2027 après les sections A à C (Nirina porte IF-2026-0001). */
export const SECTION_H = {
  hery: {
    nom: "RAMAROSON",
    prenoms: "Hery",
    sexe: "Masculin",
    naissance: "2005-08-19",
    lieu: "Toamasina",
    telephone: "034 00 000 10",
    adresse: "Lot 5, Ankirihiry, Toamasina",
    filiere: "IF",
    matricule: "IF-2026-0002",
  },
  helene: {
    nom: "RAKOTONIRINA",
    prenoms: "Hélène",
    sexe: "Féminin",
    naissance: "2005-04-25",
    lieu: "Foulpointe",
    telephone: "034 00 000 11",
    adresse: "Lot 77, Ampasimazava, Toamasina",
    filiere: "SF",
    matricule: "SF-2026-0001",
    tranches: 3,
  },
  faly: {
    nom: "ANDRIAMAMPIANINA",
    prenoms: "Faly",
    sexe: "Masculin",
    naissance: "2006-01-12",
    lieu: "Mahambo",
    telephone: "034 00 000 12",
    adresse: "Lot 33, Tanambao II, Toamasina",
    filiere: "IF",
    matricule: "IF-2026-0003",
  },
} as const satisfies Record<string, Inscrit>;

/** Les étudiants de la préparation A à C, par leur nom de famille tel qu'il s'affiche. */
export { ETUDIANTS };

/** Ouvre la fiche d'un étudiant depuis la liste (recherche du nom), vérifie son nom et son matricule. */
export async function ouvrirFicheDe(page: Page, nom: string, matricule: string) {
  await page.goto(`/app/etudiants?q=${encodeURIComponent(matricule)}`);
  await page.getByRole("link", { name: new RegExp(nom) }).first().click();
  await page.waitForURL(/\/app\/etudiants\/[^/?]+(\?.*)?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nom);
  await expect(page.getByText(matricule, { exact: true }).first()).toBeVisible();
}

export const boutonSortie = (page: Page): Locator => page.getByRole("button", { name: "Enregistrer une sortie" });
export const dialogueSortie = (page: Page): Locator => page.getByRole("dialog", { name: "Enregistrer une sortie" });

/** Résumé « Reste à payer / Dont en retard / Déjà payé » de l'onglet Écolage. */
export const resteAPayer = (page: Page): Locator =>
  page.locator("dt", { hasText: "Reste à payer" }).locator("xpath=following-sibling::dd[1]");
export const dontEnRetard = (page: Page): Locator =>
  page.locator("dt", { hasText: "Dont en retard" }).locator("xpath=following-sibling::dd[1]");

/** Les cartes d'échéance de la grille d'une année (« Dû / Payé / Reste » ou « Non due (sortie) »). */
export const cartesAnnee = (page: Page, titre: string): Locator =>
  page.getByRole("heading", { name: titre }).locator("xpath=ancestor::*[self::section or self::details][1]").getByRole("listitem");

export const carteEcheance = (page: Page, titre: string, libelle: string): Locator =>
  cartesAnnee(page, titre).filter({ hasText: libelle }).first();

export { montantRegex };

/** Aujourd'hui à Madagascar, comme l'application : « 2026-10-17 » et « 17/10/2026 ». */
export function aujourdhui(): { iso: string; fr: string } {
  const iso = new Date().toLocaleDateString("sv-SE", { timeZone: "Indian/Antananarivo" });
  const [a, m, j] = iso.split("-");
  return { iso, fr: `${j}/${m}/${a}` };
}

// UC05 : liste des étudiants

export async function ouvrirListe(page: Page, adresse = "/app/etudiants") {
  await page.goto(adresse);
  await expect(page.getByRole("heading", { level: 1, name: "Étudiants" })).toBeVisible();
}

/** Les lignes d'étudiants du tableau (hors en-tête). */
export const lignesListe = (page: Page): Locator =>
  page.getByRole("region", { name: "Liste des étudiants" }).getByRole("row").filter({ has: page.getByRole("link") });

export const ligneListe = (page: Page, nom: string): Locator => lignesListe(page).filter({ hasText: nom });

/** « 10 étudiants inscrits » ou « 3 étudiants correspondent aux critères ». */
export const decompte = (page: Page): Locator => page.getByRole("status").filter({ hasText: /étudiants? (inscrits?|correspondent? aux critères)/ });

export const champRecherche = (page: Page): Locator => page.getByRole("searchbox", { name: "Rechercher par nom, prénoms ou matricule" });

/** Tape dans la recherche ; la liste se met à jour après un court délai (adresse `?q=`). */
export async function chercher(page: Page, texte: string) {
  await champRecherche(page).fill(texte);
  await expect(page).toHaveURL(/[?&]q=/);
}

export async function choisirFiltreListe(page: Page, nom: string, option: string | RegExp) {
  await page.getByRole("combobox", { name: nom }).click();
  await page.getByRole("option", { name: option }).click();
}

/** Noms de famille des lignes affichées, dans l'ordre. */
export async function nomsAffiches(page: Page): Promise<string[]> {
  const liens = await lignesListe(page).getByRole("link").allTextContents();
  return liens.map((t) => t.trim());
}
