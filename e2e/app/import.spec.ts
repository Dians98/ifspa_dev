import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { COMPTES } from "./comptes";

// Aucun de ces parcours n'écrit en base : l'import lui-même est déroulé dans la recette (base ifspa_recette).

const FIXTURES = path.resolve(__dirname, "../fixtures/reprise");
const fichier = (nom: string) => path.join(FIXTURES, nom);

async function deposer(page: Page, fichiers: Parameters<Locator["setInputFiles"]>[0]) {
  await page.locator('input[type="file"]').setInputFiles(fichiers);
}

test.describe("Reprise des données — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("l'écran est réservé à l'administrateur", async ({ page }) => {
    await page.goto("/app/parametres/import");
    await expect(page.getByText("Accès réservé à l'administrateur")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choisir le fichier" })).toHaveCount(0);
  });
});

test.describe("Reprise des données — administrateur", () => {
  test.use({ storageState: COMPTES.admin.session });

  test.beforeEach(async ({ page }) => {
    await page.goto("/app/parametres/import");
    await expect(page.getByRole("heading", { name: "Déposer le fichier rempli" })).toBeVisible();
  });

  test("l'onglet est actif et le modèle se télécharge", async ({ page }) => {
    const onglet = page.getByRole("navigation", { name: "Sections des paramètres" }).getByRole("link", { name: "Reprise des données" });
    await expect(onglet).toHaveAttribute("aria-current", "page");

    const [telechargement] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Télécharger le modèle Excel" }).click(),
    ]);
    expect(telechargement.suggestedFilename()).toMatch(/^modele-import-ifspa-.*\.xlsx$/);
    await expect(page.getByRole("link", { name: "CSV Étudiants" })).toHaveAttribute("href", "/api/import/modele?format=etudiants.csv");
    await expect(page.getByRole("link", { name: "CSV Paiements" })).toHaveAttribute("href", "/api/import/modele?format=paiements.csv");
  });

  test("un fichier d'un autre format est refusé avant l'envoi", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Analyser le fichier" })).toBeDisabled();
    await deposer(page, { name: "liste.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") });
    await expect(page.getByRole("alert").filter({ hasText: "ancien format Excel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyser le fichier" })).toBeDisabled();

    await page.getByRole("button", { name: "Retirer liste.xls" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "ancien format" })).toHaveCount(0);
  });

  test("un fichier de plus de 1 Mo est refusé avant l'envoi", async ({ page }) => {
    await deposer(page, { name: "gros.csv", mimeType: "text/csv", buffer: Buffer.alloc(1024 * 1024 + 1, "a") });
    await expect(page.getByRole("alert").filter({ hasText: "trop volumineux" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyser le fichier" })).toBeDisabled();
  });

  test("un fichier avec une erreur ferme l'import et se corrige", async ({ page }) => {
    await deposer(page, fichier("etudiants-invalide.csv"));
    await page.getByRole("button", { name: "Analyser le fichier" }).click();

    await expect(page.getByRole("heading", { name: "Rapport de contrôle" })).toBeVisible();
    await expect(page.getByText(/rien ne peut être importé/)).toBeFocused();
    await expect(page.getByRole("heading", { name: /À corriger avant l'import/ })).toBeVisible();
    await expect(page.getByText(/XX/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Importer \d/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Choisir un autre fichier" }).click();
    await expect(page.getByRole("list", { name: "Fichiers choisis" })).toContainText("etudiants-invalide.csv");
  });

  test("un fichier correct propose l'import, avec une seule confirmation", async ({ page }) => {
    await deposer(page, [fichier("etudiants-valide.csv"), fichier("paiements-vide.csv")]);
    await page.getByRole("button", { name: "Analyser les fichiers" }).click();

    await expect(page.getByText("Prêt à importer 1 nouvel étudiant et 0 paiement.")).toBeFocused();
    await page.getByRole("button", { name: "Importer 1 étudiant et 0 paiement" }).click();

    const dialogue = page.getByRole("alertdialog");
    await expect(dialogue).toContainText("Un import ne s'annule pas.");
    await expect(dialogue).toContainText("hors des heures de guichet");
    await dialogue.getByRole("button", { name: "Annuler" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByRole("button", { name: "Importer 1 étudiant et 0 paiement" })).toBeEnabled();
  });
});
