import { expect, type Locator, type Page } from "@playwright/test";

// Gestes partagés par les parcours UC02 (Paramètres : filières, années scolaires, tarifs).

export const ADMIN = "Administrateur IFSPA";

/** Une ligne d'un tableau de Paramètres, retrouvée par un texte de sa première colonne (code ou année). */
export const ligneParametre = (page: Page, texte: string | RegExp): Locator =>
  page.getByRole("row").filter({ hasText: texte });

export async function ouvrirFilieres(page: Page) {
  await page.goto("/app/parametres/filieres");
  await expect(page.getByRole("heading", { level: 1, name: "Paramètres" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Filières" })).toBeVisible();
}

export async function ouvrirAnnees(page: Page) {
  await page.goto("/app/parametres/annees");
  await expect(page.getByRole("heading", { name: "Années scolaires" })).toBeVisible();
}

export async function ouvrirTarifs(page: Page, anneeLibelle?: string) {
  await page.goto("/app/parametres/tarifs");
  await expect(page.getByRole("heading", { name: "Tarifs par filière et par niveau" })).toBeVisible();
  if (anneeLibelle) await choisirAnneeTarifs(page, anneeLibelle);
}

/** Change l'année affichée dans la grille des tarifs (sélecteur « Année scolaire »). */
export async function choisirAnneeTarifs(page: Page, libelle: string) {
  await page.getByRole("combobox", { name: "Année scolaire" }).click();
  await page.getByRole("option", { name: new RegExp(`^${libelle} ·`) }).click();
  await expect(page.getByRole("combobox", { name: "Année scolaire" })).toContainText(libelle);
}

/** Remplit une classe de la grille ; les montants se tapent comme à la main (« 125 000 »). */
export async function saisirTarif(
  page: Page,
  classe: string,
  v: { droits?: string; mensualite?: string; mois?: string },
) {
  if (v.droits !== undefined) await page.getByLabel(`Droits d'inscription, ${classe}`).fill(v.droits);
  if (v.mensualite !== undefined) await page.getByLabel(`Mensualité, ${classe}`).fill(v.mensualite);
  if (v.mois !== undefined) await page.getByLabel(`Nombre de mois, ${classe}`).fill(v.mois);
}

/** Espaces fines et insécables des montants : on compare sans eux. */
export const sansEspaces = (texte: string | null) => (texte ?? "").replace(/[\s  ]/g, "");
