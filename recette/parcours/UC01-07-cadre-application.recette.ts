import { capture, expect, test } from "./outils";
import { DOSSIER, viderLimiteConnexion, NOM_SECRETARIAT, SANS_SESSION, connecterSecretariat, verifierUtilisateur } from "./aides-connexion";

test.use({ storageState: SANS_SESSION, viewport: { width: 1440, height: 1000 } });

test("UC01-07 : le cadre de l'application sur ordinateur (menu, repli, page indisponible)", async ({ page, isMobile }) => {
  test.skip(isMobile, "Cas ordinateur : le téléphone est dans UC01-08.");
  test.setTimeout(120_000);
  await viderLimiteConnexion(page);
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  const barre = page.locator('[data-slot="sidebar"]');

  await test.step("1. Se connecter : le tableau de bord est l'entrée active du menu", async () => {
    await connecterSecretariat(page);
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(menu.locator('[aria-current="page"]')).toHaveText(/Tableau de bord/);
  });

  await test.step("2. Cliquer « Encaisser », « Étudiants » : l'entrée active suit la page", async () => {
    await menu.getByRole("link", { name: "Encaisser", exact: true }).click();
    await page.waitForURL("**/app/encaisser");
    await expect(menu.locator('[aria-current="page"]')).toHaveText(/Encaisser/);
    await menu.getByRole("link", { name: "Étudiants", exact: true }).click();
    await page.waitForURL("**/app/etudiants");
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants" })).toBeVisible();
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(menu.locator('[aria-current="page"]')).toHaveText(/Étudiants/);
    await capture(page, DOSSIER, "UC01-07-02-entree-active");
  });

  await test.step("3. Replier le menu : la barre se réduit aux icônes, le compte reste accessible", async () => {
    await page.getByRole("button", { name: "Replier le menu", exact: true }).click();
    await expect(barre).toHaveAttribute("data-state", "collapsed");
    await expect(menu.getByRole("link", { name: "Encaisser", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await capture(page, DOSSIER, "UC01-07-03-menu-replie");
  });

  await test.step("4. Déplier le menu : les libellés reviennent", async () => {
    await page.getByRole("button", { name: "Déplier le menu", exact: true }).click();
    await expect(barre).toHaveAttribute("data-state", "expanded");
    await verifierUtilisateur(page, NOM_SECRETARIAT, "Secrétariat");
  });

  await test.step("5. Une adresse inconnue de l'application reste dans le cadre : « Page indisponible »", async () => {
    const reponse = await page.goto("/app/ecran-inexistant");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page indisponible" })).toBeVisible();
    await expect(page.getByText("Cet écran n'est pas encore disponible.")).toBeVisible();
    await expect(menu).toBeVisible();
    await capture(page, DOSSIER, "UC01-07-05-page-indisponible");
  });

  await test.step("6. « Retour au tableau de bord » puis le logo IFSPA ramènent à l'accueil de l'application", async () => {
    await page.getByRole("link", { name: "Retour au tableau de bord" }).click();
    await page.waitForURL("**/app/dashboard");
    await menu.getByRole("link", { name: "Paiements", exact: true }).click();
    await page.waitForURL("**/app/paiements");
    await page.getByRole("complementary", { name: "Barre latérale" }).getByRole("link", { name: "IFSPA" }).click();
    await page.waitForURL("**/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  });

  await test.step("7. /app renvoie au tableau de bord", async () => {
    await page.goto("/app");
    await page.waitForURL("**/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  });

  await test.step("8. Au clavier, le lien « Aller au contenu » apparaît en premier", async () => {
    await page.goto("/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    await page.keyboard.press("Tab");
    const lien = page.getByRole("link", { name: "Aller au contenu" });
    await expect(lien).toBeFocused();
    await expect(lien).toBeVisible();
    await capture(page, DOSSIER, "UC01-07-08-aller-au-contenu");
  });
});
