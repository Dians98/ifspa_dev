import { test, expect, SESSIONS } from "./outils";
import { ouvrirMenu } from "../../e2e/app/comptes";
import { bloquerServicesExternes, captureEcran, enMobile } from "./UC14-aides";

test.use({ storageState: SESSIONS.secretariat });

test("UC14-06 un membre du personnel déjà connecté ouvre le site public", async ({ page }) => {
  await bloquerServicesExternes(page);

  await test.step("1. La landing reste affichée, sans redirection", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/localhost:3200\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se former aux métiers paramédicaux à Toamasina");
    // Constat : l'en-tête propose toujours « Se connecter », sans lien vers l'espace du personnel.
    await expect(page.getByRole("banner").getByRole("link", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: /tableau de bord|mon espace|application/i })).toHaveCount(0);
    await captureEcran(page, "UC14-06-01-landing-connecte");
  });

  await test.step("2. « Se connecter » mène directement au tableau de bord", async () => {
    await page.getByRole("banner").getByRole("link", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    if (enMobile()) await ouvrirMenu(page);
    await expect(page.getByText("Hanitra RAKOTO")).toBeVisible();
    await captureEcran(page, "UC14-06-02-tableau-de-bord");
  });

  await test.step("3. /connexion ouvert à la main renvoie aussi au tableau de bord", async () => {
    await page.goto("/connexion");
    await expect(page).toHaveURL(/\/app\/dashboard$/);
  });
});
