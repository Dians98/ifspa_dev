import { expect, type Locator, type Page } from "@playwright/test";

// Gestes partagés par les parcours UC10 (Passage en année supérieure).

export const DOSSIER_UC10 = "UC10-passage";

export const ETUDIANTS_IF = {
  tiana: "ANDRIANARISOA Tiana",
  voahirana: "RAKOTOMALALA Voahirana",
  solofo: "RANDRIAMAHEFA Solofo",
  fanja: "RASOANAIVO Fanja",
} as const;

export const ETUDIANTS_SF = {
  lalaina: "RABEMANANJARA Lalaina",
  mialy: "RAZAFINDRAKOTO Mialy",
} as const;

export async function ouvrirAdmissions(page: Page) {
  await page.goto("/app/admissions");
  await expect(page.getByRole("heading", { level: 1, name: "Passage en année supérieure" })).toBeVisible();
}

/** Lien d'une classe dans la liste de gauche (« Infirmier(e)s » ou « Sage-femmes », puis « 1re année »). */
export const lienClasse = (page: Page, filiere: "Infirmier(e)s" | "Sage-femmes", niveau: string): Locator =>
  page
    .getByRole("navigation", { name: "Classes" })
    .getByRole("region", { name: filiere })
    .getByRole("link", { name: new RegExp(`^${niveau}`) });

export async function choisirClasse(page: Page, filiere: "Infirmier(e)s" | "Sage-femmes", niveau: string) {
  await lienClasse(page, filiere, niveau).click();
  await expect(page.getByRole("heading", { level: 2, name: `${filiere} ${niveau}` })).toBeVisible();
}

/** Case « Passe en 2e année » d'un étudiant. */
export const caseEtudiant = (page: Page, etudiant: string): Locator => page.getByRole("checkbox", { name: new RegExp(`^${etudiant} :`) });

export const ligneEtudiant = (page: Page, etudiant: string): Locator =>
  page.getByTestId("ligne-etudiant").filter({ hasText: etudiant });

/** Décoche un étudiant : il passe en « Redouble » par défaut. */
export async function decocher(page: Page, etudiant: string) {
  await caseEtudiant(page, etudiant).click();
  await expect(caseEtudiant(page, etudiant)).not.toBeChecked();
}

/** Choix « Redouble » ou « Abandon » sur la ligne d'un étudiant décoché. */
export async function choisirDecision(page: Page, etudiant: string, decision: "Redouble" | "Abandon") {
  await ligneEtudiant(page, etudiant).getByRole("radio", { name: decision }).click();
  await expect(ligneEtudiant(page, etudiant).getByRole("radio", { name: decision })).toBeChecked();
}

export const barreResume = (page: Page): Locator => page.getByRole("status").filter({ hasText: /passe(nt)? en|Diplômé/ });
