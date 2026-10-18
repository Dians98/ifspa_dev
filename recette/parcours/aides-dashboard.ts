import { expect, type Locator, type Page } from "@playwright/test";

// Gestes partagés par les parcours UC12 (tableau de bord). Données : sections A, B, C, G, H et I de 00-PREPARATION.md.

export const DOSSIER_UC12 = "UC12-dashboard";

/** Reçus de la section I, dans l'ordre d'émission (G : 21 à 23, I : 24 à 32). */
export const RECUS = {
  voahirana1: "R-2026-00021",
  fanja: "R-2026-00022",
  nirina1: "R-2026-00023",
  tiana: "R-2026-00024",
  mialy: "R-2026-00025",
  lalaina: "R-2026-00026",
  solofo: "R-2026-00027",
  voahirana2: "R-2026-00028",
  nirina2: "R-2026-00029",
  helene: "R-2026-00030",
  hery: "R-2026-00031",
  faly: "R-2026-00032",
} as const;

export async function ouvrirDashboard(page: Page, adresse = "/app/dashboard") {
  await page.goto(adresse);
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  await expect(page.getByText(/^Situation au \d{2}\/\d{2}\/\d{4} · année scolaire /)).toBeVisible();
}

/** « Situation au 18/10/2026 · année scolaire 2025-2026 · Infirmier(e)s ». */
export const situation = (page: Page): Locator => page.getByText(/^Situation au \d{2}\/\d{2}\/\d{4} · année scolaire /);

export async function choisirAnnee(page: Page, libelle: string) {
  await page.getByRole("combobox", { name: "Année scolaire" }).click();
  await page.getByRole("option", { name: new RegExp(`^${libelle}`) }).click();
  await expect(page).toHaveURL(/[?&]anneeId=/);
  await expect(situation(page)).toContainText(`année scolaire ${libelle}`);
}

export async function choisirFiliere(page: Page, nom: string) {
  await page.getByRole("combobox", { name: "Filière" }).click();
  await page.getByRole("option", { name: nom, exact: true }).click();
  if (nom === "Toutes les filières") await expect(situation(page)).not.toContainText(/ · (Infirmier|Sage)/);
  else await expect(situation(page)).toContainText(`· ${nom}`);
}

/** Une des trois cartes : « Effectif actif », « Taux de recouvrement », « Étudiants en retard ». */
export const carte = (page: Page, libelle: string): Locator =>
  page.getByRole("region", { name: "Indicateurs" }).locator("dl > div").filter({ has: page.locator("dt", { hasText: libelle }) });

export const tableau = (page: Page): Locator => page.getByRole("region", { name: "Recouvrement par filière et par niveau" });
export const derniers = (page: Page): Locator => page.getByRole("region", { name: "Derniers paiements" });

const lignes = (page: Page): Locator => tableau(page).locator("tr");

/** La ligne d'une classe (« Infirmier(e)s », « 1re année »). */
export const ligneClasse = (page: Page, filiere: string, niveau: string): Locator =>
  lignes(page)
    .filter({ has: page.locator('[data-label="Filière"]', { hasText: filiere }) })
    .filter({ has: page.locator('[data-label="Niveau"]', { hasText: niveau }) });

export const sousTotal = (page: Page, filiere: string): Locator => lignes(page).filter({ hasText: `Sous-total ${filiere}` });
export const totalTableau = (page: Page): Locator => tableau(page).locator("tfoot tr");

export type Chiffres = {
  effectif: number;
  attendu: number;
  encaisse: number;
  reste: number;
  /** « 16,4 % », ou null : « — » (rien d'échu). */
  taux: string | null;
  enRetard: number;
};

const ariary = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s")}\\sAr`;

/** Vérifie les six colonnes chiffrées d'une ligne du tableau (classe, sous-total ou total). */
export async function verifierLigne(ligne: Locator, c: Chiffres) {
  const cellule = (nom: string) => ligne.locator(`[data-label="${nom}"]`);
  await expect(cellule("Effectif")).toHaveText(String(c.effectif));
  await expect(cellule("Attendu à date")).toHaveText(new RegExp(`^${ariary(c.attendu)}$`));
  await expect(cellule("Encaissé")).toHaveText(new RegExp(`^${ariary(c.encaisse)}$`));
  await expect(cellule("Reste")).toHaveText(new RegExp(`^${ariary(c.reste)}$`));
  if (c.taux === null) await expect(cellule("Taux de recouvrement")).toContainText("—");
  else await expect(cellule("Taux de recouvrement")).toContainText(c.taux);
  await expect(cellule("En retard")).toContainText(String(c.enRetard));
}

/** Détail de la carte « Taux de recouvrement » : « 1 540 000 Ar encaissés sur 5 400 000 Ar attendus à date ». */
export const lignesDerniers = (page: Page): Locator => derniers(page).locator("tbody tr");

export async function numerosDerniers(page: Page): Promise<string[]> {
  const liens = await derniers(page).locator("tbody tr").locator("a[href$='/recu']").allTextContents();
  return liens.map((t) => t.trim());
}

export { montantRegex } from "./aides";
