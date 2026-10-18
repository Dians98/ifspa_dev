import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { montantRegex } from "./aides";
import { SESSIONS } from "./outils";

// Gestes partagés par les parcours UC07 (page Paiements). Numéros de reçu de la section F de 00-PREPARATION.md.

export const DOSSIER_UC07 = "UC07-paiements";

export const RECUS = {
  voahiranaOctobre: "R-2026-00021",
  voahiranaNovembre: "R-2026-00022",
  fanja: "R-2026-00023",
  tiana: "R-2026-00044",
} as const;

/** Un second navigateur ouvert en administrateur, pour les cas où le poste principal est celui du secrétariat. */
export async function ouvrirAdmin(browser: Browser, baseURL: string | undefined, hauteur = 1300): Promise<{ contexte: BrowserContext; page: Page }> {
  const contexte = await browser.newContext({ baseURL, storageState: SESSIONS.admin, viewport: { width: 1440, height: hauteur } });
  const page = await contexte.newPage();
  await page.addInitScript(() => {
    const fenetre = window as unknown as { __impressions: number };
    fenetre.__impressions = 0;
    window.print = () => {
      fenetre.__impressions += 1;
    };
  });
  return { contexte, page };
}

export const ligne =(page: Page, numero: string): Locator => page.getByRole("row").filter({ hasText: numero });

/** Valeur du récapitulatif de la période (« Total encaissé », « dont espèces »…). */
export const total = (page: Page, libelle: string): Locator =>
  page.locator("dt", { hasText: libelle }).locator("xpath=following-sibling::dd");

export async function verifierTotal(page: Page, libelle: string, montant: number) {
  await expect(total(page, libelle)).toHaveText(montantRegex(montant));
}

export async function ouvrirPaiements(page: Page, adresse = "/app/paiements") {
  await page.goto(adresse);
  await expect(page.getByRole("heading", { level: 1, name: "Historique des paiements" })).toBeVisible();
}

/** Tape dans la recherche ; la liste se met à jour après un court délai (adresse `?q=`). */
export async function rechercher(page: Page, texte: string) {
  await page.getByRole("searchbox", { name: "Rechercher un reçu, un étudiant, une note ou un n° de reçu papier" }).fill(texte);
  await expect(page).toHaveURL(/[?&]q=/);
}

export async function choisirFiltre(page: Page, nom: string, option: string) {
  await page.getByRole("combobox", { name: nom }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

export const nombreDeLignes = (page: Page) => page.getByRole("row").filter({ has: page.getByRole("link", { name: /^R-\d{4}-\d{5}$/ }) });

export async function verifierNombre(page: Page, attendu: number) {
  await expect(nombreDeLignes(page)).toHaveCount(attendu);
}
