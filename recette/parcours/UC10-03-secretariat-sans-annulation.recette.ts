import { choisirClasse, DOSSIER_UC10 as DOSSIER, ouvrirAdmissions } from "./aides-admissions";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1000 } });

test("UC10-03 : le secrétariat lance un passage mais ne peut pas l'annuler", async ({ page }) => {
  await test.step("1. Classe validée : la liste figée, sans bouton d'annulation", async () => {
    await ouvrirAdmissions(page);
    await choisirClasse(page, "Infirmier(e)s", "1re année");
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(page.getByText("Secrétariat", { exact: true })).toBeVisible();
    await expect(page.getByText(/Classe validée le .+ par Hanitra RAKOTO/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Annuler/ })).toHaveCount(0);
    await capture(page, DOSSIER, "UC10-03-01-classe-validee-sans-bouton");
  });

  await test.step("2. Historique : le passage est « Actif », sans bouton « Annuler »", async () => {
    await page.getByRole("link", { name: "Historique" }).click();
    await expect(page.getByRole("heading", { name: "Passages validés" })).toBeVisible();
    await expect(page.getByText("Seul l'administrateur peut annuler un passage.")).toBeVisible();
    const ligne = page.getByRole("row").filter({ hasText: "Infirmier(e)s 1re année" });
    await expect(ligne).toContainText("2025-2026 vers 2026-2027");
    await expect(ligne).toContainText("3 passent en 2e année");
    await expect(ligne).toContainText("1 redouble");
    await expect(ligne).toContainText("Actif");
    await expect(ligne).toContainText("Hanitra RAKOTO");
    await expect(page.getByRole("button", { name: /Annuler/ })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC10-03-02-historique-sans-bouton");
  });
});
