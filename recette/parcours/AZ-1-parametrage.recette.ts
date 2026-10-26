import { DOSSIER } from "./aides-az";
import { capture, expect, SESSIONS, test } from "./outils";

// Acte 1 du parcours A-Z : l'administrateur prépare l'année 2025-2026. Départ : base vidée par `pnpm parcours:vider`.
test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

test("Acte 1 : l'administrateur crée l'année 2025-2026, ses tarifs, et la rend courante", async ({ page }) => {
  await test.step("1.1 Paramètres › Années scolaires : aucune année", async () => {
    await page.goto("/app/parametres/annees");
    await expect(page.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Années scolaires" })).toBeVisible();
    await capture(page, DOSSIER, "AZ-1-1-annees-vides");
  });

  await test.step("1.2 Nouvelle année : 2025", async () => {
    await page.getByRole("button", { name: "Nouvelle année" }).first().click();
    const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
    await dialogue.getByLabel("Année de début").fill("2025");
    await expect(dialogue.getByText(/Année 2025-2026 : mensualités de/)).toBeVisible();
    await capture(page, DOSSIER, "AZ-1-2-nouvelle-annee", dialogue);
  });

  await test.step("1.3 Créer l'année", async () => {
    const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText("Année 2025-2026 créée, en préparation. Saisissez maintenant ses tarifs.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Tarifs de l'année 2025-2026" })).toBeVisible();
    await capture(page, DOSSIER, "AZ-1-3-annee-creee");
  });

  await test.step("1.4 Tarifs IF et SF 1re année", async () => {
    await page.getByRole("link", { name: "Tarifs de l'année 2025-2026" }).click();
    await page.waitForURL("**/app/parametres/tarifs?annee=*");
    await page.getByLabel("Droits d'inscription, IF 1re année").fill("100 000");
    await page.getByLabel("Mensualité, IF 1re année").fill("80 000");
    await page.getByLabel("Droits d'inscription, SF 1re année").fill("120 000");
    await page.getByLabel("Mensualité, SF 1re année").fill("90 000");
    await expect(page.getByLabel("Nombre de mois, IF 1re année")).toHaveValue("10");
    await expect(page.getByLabel("Nombre de mois, SF 1re année")).toHaveValue("10");
    await expect(page.getByText("2 classes modifiées, pas encore enregistrées.")).toBeVisible();
    await capture(page, DOSSIER, "AZ-1-4-tarifs-saisis");
  });

  await test.step("1.5 Enregistrer les tarifs", async () => {
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Modifiez directement les montants dans le tableau.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(/80\s000/);
    await expect(page.getByLabel("Mensualité, SF 1re année")).toHaveValue(/90\s000/);
    await expect(page.getByText("4 tarifs sont à saisir.")).toBeVisible();
    await capture(page, DOSSIER, "AZ-1-5-tarifs-enregistres");
  });

  await test.step("1.6 Définir 2025-2026 comme année courante", async () => {
    await page.goto("/app/parametres/annees");
    await page.getByRole("button", { name: "Définir 2025-2026 comme année courante" }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("Définir 2025-2026 comme année courante ?");
    await capture(page, DOSSIER, "AZ-1-6-confirmer-courante", confirmation);
    await confirmation.getByRole("button", { name: "Définir comme année courante" }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByText("Année courante", { exact: true })).toBeVisible();
    await capture(page, DOSSIER, "AZ-1-6b-annee-courante");
  });
});
