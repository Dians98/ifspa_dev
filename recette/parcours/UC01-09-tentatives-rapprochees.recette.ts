import { COMPTES } from "../../e2e/app/comptes";
import { capture, expect, test } from "./outils";
import { DOSSIER, SANS_SESSION, saisirIdentifiants } from "./aides-connexion";

test.use({ storageState: SANS_SESSION, viewport: { width: 1440, height: 1000 } });

const MESSAGE = "Adresse e-mail ou mot de passe incorrect.";

test("UC01-09 : quatre tentatives en moins de dix secondes", async ({ page }) => {
  test.setTimeout(120_000);
  const bouton = page.getByRole("button", { name: "Se connecter" });

  // Laisse passer la fenêtre de dix secondes des connexions précédentes.
  await page.waitForTimeout(11_000);
  await page.goto("/connexion");

  await test.step("1. Trois mots de passe faux de suite : « Adresse e-mail ou mot de passe incorrect. »", async () => {
    for (let i = 1; i <= 3; i++) {
      await saisirIdentifiants(page, COMPTES.secretariat.email, `mauvais-mot-de-passe-${i}`);
      await bouton.click();
      await expect(page.getByRole("alert").filter({ hasText: MESSAGE })).toBeVisible();
      await expect(bouton).toBeEnabled();
    }
    await capture(page, DOSSIER, "UC01-09-01-trois-echecs");
  });

  await test.step("2. Le bon mot de passe tout de suite après : refusé avec le même message", async () => {
    await saisirIdentifiants(page, COMPTES.secretariat.email, COMPTES.secretariat.motDePasse);
    await bouton.click();
    await expect(page.getByRole("alert").filter({ hasText: MESSAGE })).toBeVisible();
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(/\/connexion$/);
    await capture(page, DOSSIER, "UC01-09-02-bon-mot-de-passe-refuse");
  });

  await test.step("3. Après une pause de dix secondes, le même mot de passe passe", async () => {
    await page.waitForTimeout(11_000);
    await bouton.click();
    await page.waitForURL("**/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  });
});
