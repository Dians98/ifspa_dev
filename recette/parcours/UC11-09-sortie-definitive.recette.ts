import { boutonSortie, DOSSIER_UC11 as DOSSIER, ouvrirFicheDe, SECTION_H } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

const { helene } = SECTION_H;

// Après UC11-02 : Hélène a été exclue.
test("UC11-09 : une sortie enregistrée est définitive, même pour l'administrateur", async ({ page }) => {
  test.setTimeout(90_000);

  await test.step("1. Administrateur : la fiche de l'étudiante exclue n'offre ni nouvelle sortie ni annulation de la sortie", async () => {
    await ouvrirFicheDe(page, helene.nom, helene.matricule);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await expect(page.getByText(/Sorti · Exclu le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(boutonSortie(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /annuler la sortie|rétablir|réintégrer|réinscrire|rouvrir/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /annuler la sortie|rétablir|réintégrer|réinscrire|rouvrir/i })).toHaveCount(0);
    await capture(page, DOSSIER, "UC11-09-01-fiche-sortie-admin");
  });

  await test.step("2. La page Modifier ne laisse pas changer le statut de l'étudiant", async () => {
    await page.getByRole("link", { name: "Modifier" }).click();
    await page.waitForURL(/\/modifier$/);
    await expect(page.getByRole("heading", { level: 1, name: "Modifier l'étudiant" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Actif|Exclu|Abandon/ })).toHaveCount(0);
    await expect(page.getByLabel(/Statut/)).toHaveCount(0);
    await capture(page, DOSSIER, "UC11-09-02-modifier");
  });
});
