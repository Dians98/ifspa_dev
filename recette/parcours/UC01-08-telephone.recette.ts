import { capture, expect, test } from "./outils";
import { DOSSIER, viderLimiteConnexion, NOM_SECRETARIAT, SANS_SESSION, connecterSecretariat } from "./aides-connexion";
import { ouvrirMenu } from "../../e2e/app/comptes";

test.use({ storageState: SANS_SESSION });

test("UC01-08 : sur téléphone, connexion, tiroir du menu et bouton Encaisser", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Cas téléphone : à lancer avec --project mobile.");
  test.setTimeout(120_000);
  await viderLimiteConnexion(page);
  const menu = page.getByRole("navigation", { name: "Menu principal" });

  await test.step("1. La page de connexion tient dans l'écran du téléphone", async () => {
    await page.goto("/connexion");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await capture(page, DOSSIER, "UC01-08-01-connexion");
  });

  await test.step("2. Après connexion, l'en-tête propose « Encaisser » et le bouton du menu", async () => {
    await connecterSecretariat(page);
    await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Encaisser", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await capture(page, DOSSIER, "UC01-08-02-tableau-de-bord");
  });

  await test.step("3. Ouvrir le menu : le tiroir montre les entrées et le nom de la secrétaire", async () => {
    await ouvrirMenu(page);
    for (const nom of ["Tableau de bord", "Étudiants", "Passage en année supérieure", "Encaisser", "Paiements", "Impayés"]) {
      await expect(menu.getByRole("link", { name: nom, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole("link", { name: "Paramètres", exact: true })).toHaveCount(0);
    await expect(page.getByText(NOM_SECRETARIAT, { exact: true })).toBeVisible();
    await expect(page.getByText("Secrétariat", { exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC01-08-03-tiroir-menu", page.getByRole("dialog"));
  });

  await test.step("4. Choisir « Étudiants » : le tiroir se referme sur la liste", async () => {
    await menu.getByRole("link", { name: "Étudiants", exact: true }).click();
    await page.waitForURL("**/app/etudiants");
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants" })).toBeVisible();
    await expect(menu).toHaveCount(0);
    await capture(page, DOSSIER, "UC01-08-04-etudiants");
  });

  await test.step("5. Le bouton « Encaisser » de l'en-tête ouvre le guichet", async () => {
    await page.getByRole("link", { name: "Encaisser", exact: true }).first().click();
    await page.waitForURL("**/app/encaisser");
    await expect(page.getByRole("heading", { level: 1, name: "Encaisser" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Encaisser", exact: true })).toHaveCount(0);
    await page.waitForTimeout(3000);
    await capture(page, DOSSIER, "UC01-08-05-encaisser");
  });

  await test.step("6. Se déconnecter depuis le tiroir", async () => {
    await ouvrirMenu(page);
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL("**/connexion");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await capture(page, DOSSIER, "UC01-08-06-deconnecte");
  });
});
