import { expect, test } from "@playwright/test";
import { attendreTableauDeBord, COMPTES, ouvrirMenu, seConnecter } from "./comptes";

test.describe("Connexion", () => {
  test("sans session, l'espace connecté renvoie vers la connexion", async ({ page }) => {
    await page.goto("/app/etudiants");
    await expect(page).toHaveURL(/\/connexion\?retour=%2Fapp%2Fetudiants$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Connexion");
  });

  test("un mauvais mot de passe est refusé sans dire quel champ est faux", async ({ page }) => {
    await seConnecter(page, COMPTES.admin.email, "pas-le-bon-mot-de-passe");
    await expect(page.getByRole("alert").filter({ hasText: "Adresse e-mail ou mot de passe incorrect." })).toBeVisible();
    await expect(page).toHaveURL(/\/connexion/);
  });

  test("un compte inconnu reçoit le même message", async ({ page }) => {
    await seConnecter(page, "inconnu@ifspa.mg", "peu-importe-123");
    await expect(page.getByRole("alert").filter({ hasText: "Adresse e-mail ou mot de passe incorrect." })).toBeVisible();
  });

  test("après connexion, on revient sur la page demandée", async ({ page }) => {
    await page.goto("/app/dashboard?depuis=test");
    await expect(page).toHaveURL(/\/connexion\?retour=/);
    await page.getByLabel("Adresse e-mail").fill(COMPTES.secretariat.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(COMPTES.secretariat.motDePasse);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/app/dashboard?depuis=test");
  });

  test("une adresse de retour externe est ignorée", async ({ page }) => {
    await page.goto("/connexion?retour=https%3A%2F%2Fexemple.com");
    await page.getByLabel("Adresse e-mail").fill(COMPTES.secretariat.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(COMPTES.secretariat.motDePasse);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await attendreTableauDeBord(page);
  });

  test("la déconnexion ferme la session", async ({ page, isMobile }) => {
    await seConnecter(page, COMPTES.secretariat.email, COMPTES.secretariat.motDePasse);
    await attendreTableauDeBord(page);
    if (isMobile) await ouvrirMenu(page);
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL("**/connexion");
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/connexion/);
  });
});

test.describe("Déjà connecté", () => {
  test.use({ storageState: COMPTES.admin.session });

  test("la page de connexion renvoie vers l'application", async ({ page }) => {
    await page.goto("/connexion");
    await attendreTableauDeBord(page);
  });
});
