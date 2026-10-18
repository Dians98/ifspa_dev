import { COMPTES } from "../../e2e/app/comptes";
import { capture, expect, test } from "./outils";
import { DOSSIER, viderLimiteConnexion, SANS_SESSION, respecterLimiteConnexion, saisirIdentifiants } from "./aides-connexion";

test.use({ storageState: SANS_SESSION, viewport: { width: 1440, height: 1000 } });

const MESSAGE = "Adresse e-mail ou mot de passe incorrect.";

test("UC01-03 : saisies incomplètes et identifiants faux sont refusés", async ({ page }) => {
  test.setTimeout(120_000);
  await viderLimiteConnexion(page);
  const alerte = page.getByRole("alert").filter({ hasText: MESSAGE });
  const bouton = page.getByRole("button", { name: "Se connecter" });

  await page.goto("/connexion");

  await test.step("1. Cliquer « Se connecter » sans rien saisir", async () => {
    await bouton.click();
    await expect(page.getByText("Saisissez votre adresse e-mail.")).toBeVisible();
    await expect(page.getByText("Saisissez votre mot de passe.")).toBeVisible();
    await expect(page).toHaveURL(/\/connexion$/);
    await capture(page, DOSSIER, "UC01-03-01-champs-vides");
  });

  await test.step("2. Une adresse sans « @ » est refusée", async () => {
    await page.getByLabel("Adresse e-mail").fill("hanitra");
    await bouton.click();
    await expect(page.getByText("Saisissez une adresse e-mail valide.")).toBeVisible();
    await expect(page.getByText("Saisissez votre mot de passe.")).toBeVisible();
    await capture(page, DOSSIER, "UC01-03-02-adresse-invalide");
  });

  await test.step("3. L'œil affiche puis masque le mot de passe saisi", async () => {
    await page.getByLabel("Mot de passe", { exact: true }).fill("exemple-123");
    await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
    await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveAttribute("type", "text");
    await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("exemple-123");
    await expect(page.getByRole("button", { name: "Masquer le mot de passe" })).toBeVisible();
    await capture(page, DOSSIER, "UC01-03-03-mot-de-passe-affiche");
    await page.getByRole("button", { name: "Masquer le mot de passe" }).click();
    await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveAttribute("type", "password");
  });

  await test.step("4. Bonne adresse, mauvais mot de passe", async () => {
    await saisirIdentifiants(page, COMPTES.admin.email, "pas-le-bon-mot-de-passe");
    await respecterLimiteConnexion(page);
    await bouton.click();
    await expect(alerte).toBeVisible();
    await expect(page).toHaveURL(/\/connexion$/);
    await capture(page, DOSSIER, "UC01-03-04-mauvais-mot-de-passe");
  });

  await test.step("5. Adresse inconnue : le même message, sans dire quel champ est faux", async () => {
    await saisirIdentifiants(page, "inconnu@ifspa.mg", "peu-importe-123");
    await respecterLimiteConnexion(page);
    await bouton.click();
    await expect(alerte).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(1);
    await expect(page).toHaveURL(/\/connexion$/);
    await capture(page, DOSSIER, "UC01-03-05-adresse-inconnue");
  });

  await test.step("6. Les bons identifiants passent ensuite normalement", async () => {
    await saisirIdentifiants(page, COMPTES.secretariat.email, COMPTES.secretariat.motDePasse);
    await respecterLimiteConnexion(page);
    await bouton.click();
    await page.waitForURL("**/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  });
});
