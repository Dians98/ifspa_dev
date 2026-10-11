import { COMPTES } from "./comptes";
import { expect, test } from "./mise-en-place";

test.describe("Impayés — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("trouver un étudiant en retard, l'appeler ou aller l'encaisser", async ({ page, etudiant }) => {
    await page.goto(`/app/impayes?q=${encodeURIComponent(etudiant.nom)}`);

    await expect(page.getByRole("link", { name: etudiant.nomComplet, exact: true })).toBeVisible();
    await expect(page.getByText(/\b1\b\s*étudiant en retard/)).toBeVisible();
    // 4 × 80 000 Ar échus.
    await expect(page.getByText(/320\s000\sAr/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /034 12 345 67/ })).toHaveAttribute("href", "tel:0341234567");
    await expect(page.getByRole("link", { name: "Exporter (Excel)" })).toHaveAttribute("href", /\/api\/export\/impayes\?q=/);

    await page.getByRole("link", { name: `Encaisser pour ${etudiant.nomComplet}` }).click();
    await page.waitForURL(/\/app\/encaisser\?etudiant=/);
    await expect(page.getByLabel("Montant reçu")).toBeVisible();
  });

  test("aucun résultat : message et lien pour effacer les filtres", async ({ page }) => {
    await page.goto("/app/impayes?q=zzzintrouvablezzz");
    await expect(page.getByText("Aucun étudiant en retard ne correspond à ces filtres.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Effacer les filtres" })).toBeVisible();
  });
});
