import { COMPTES } from "./comptes";
import { expect, test } from "./mise-en-place";

test.describe("Tableau de bord — administrateur", () => {
  test.use({ storageState: COMPTES.admin.session });

  test("les trois cartes, le tableau et les derniers paiements s'affichent", async ({ page, etudiant }) => {
    await page.goto("/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();

    const indicateurs = page.getByRole("region", { name: "Indicateurs" });
    await expect(indicateurs.getByText("Effectif actif")).toBeVisible();
    await expect(indicateurs.getByText("Taux de recouvrement")).toBeVisible();
    await expect(indicateurs.getByText("Étudiants en retard")).toBeVisible();
    await expect(indicateurs.getByRole("link", { name: "Voir la liste des impayés" })).toHaveAttribute("href", /\/app\/impayes/);

    // L'étudiant jetable a 4 mensualités échues impayées : il figure dans le tableau et dans le total.
    const tableau = page.getByRole("region", { name: "Recouvrement par filière et par niveau" });
    await expect(tableau.getByRole("row", { name: /^Total/ })).toBeVisible();
    await expect(tableau.getByText(/Infirmier/).first()).toBeVisible();
    expect(etudiant.id).toBeTruthy();

    await expect(page.getByRole("region", { name: "Derniers paiements" })).toBeVisible();
    await expect(page.getByText(/encaissé du mois|reste à recouvrer|plus gros impayés/i)).toHaveCount(0);
  });

  test("changer la filière met à jour l'adresse et le tableau", async ({ page, etudiant }) => {
    await page.goto("/app/dashboard");
    expect(etudiant.id).toBeTruthy();

    await page.getByRole("combobox", { name: "Filière" }).click();
    await page.getByRole("option", { name: "Sage-femmes" }).click();
    await expect(page).toHaveURL(/filiereId=/);

    const tableau = page.getByRole("region", { name: "Recouvrement par filière et par niveau" });
    await expect(tableau.getByText(/Infirmier/)).toHaveCount(0);
    await expect(page.getByText(/année scolaire .* · Sage-femmes/)).toBeVisible();

    await page.getByRole("combobox", { name: "Filière" }).click();
    await page.getByRole("option", { name: "Toutes les filières" }).click();
    await expect(page).not.toHaveURL(/filiereId=/);
    await expect(tableau.getByText(/Infirmier/).first()).toBeVisible();
  });
});

test.describe("Tableau de bord — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("le secrétariat y a accès", async ({ page }) => {
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Indicateurs" })).toBeVisible();
  });
});
