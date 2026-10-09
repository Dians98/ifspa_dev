import { expect, test } from "@playwright/test";
import { COMPTES, ouvrirMenu } from "./comptes";

const ENTREES_COMMUNES = ["Tableau de bord", "Étudiants", "Passage en année supérieure", "Encaisser", "Paiements", "Impayés"];

test.describe("Cadre de l'application — administrateur", () => {
  test.use({ storageState: COMPTES.admin.session });

  test("le menu propose tous les écrans, Paramètres compris", async ({ page, isMobile }) => {
    await page.goto("/app/dashboard");
    if (isMobile) await ouvrirMenu(page);
    const menu = page.getByRole("navigation", { name: "Menu principal" });
    for (const nom of [...ENTREES_COMMUNES, "Paramètres"]) {
      await expect(menu.getByRole("link", { name: nom, exact: true })).toBeVisible();
    }
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(menu.locator('[aria-current="page"]')).toHaveText(/Tableau de bord/);
  });

  test("le nom et le rôle de l'utilisateur sont affichés", async ({ page, isMobile }) => {
    await page.goto("/app/dashboard");
    if (isMobile) await ouvrirMenu(page);
    await expect(page.getByText("Administrateur", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  });

  test("/app renvoie au tableau de bord", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/dashboard$/);
  });

  test("un écran pas encore construit reste dans le cadre de l'application", async ({ page, isMobile }) => {
    const reponse = await page.goto("/app/ecran-inexistant");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByText("Cet écran n'est pas encore disponible.")).toBeVisible();
    if (isMobile) await ouvrirMenu(page);
    await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeVisible();
  });

  test("la page ne déborde pas horizontalement", async ({ page }) => {
    await page.goto("/app/dashboard");
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(deborde).toBe(false);
  });
});

test.describe("Cadre de l'application — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("le menu ne propose pas Paramètres", async ({ page, isMobile }) => {
    await page.goto("/app/dashboard");
    if (isMobile) await ouvrirMenu(page);
    const menu = page.getByRole("navigation", { name: "Menu principal" });
    for (const nom of ENTREES_COMMUNES) {
      await expect(menu.getByRole("link", { name: nom, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole("link", { name: "Paramètres", exact: true })).toHaveCount(0);
    await expect(page.getByText("Secrétariat", { exact: true })).toBeVisible();
  });
});
