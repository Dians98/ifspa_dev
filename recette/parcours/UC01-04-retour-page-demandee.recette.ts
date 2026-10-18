import { COMPTES } from "../../e2e/app/comptes";
import { capture, expect, test } from "./outils";
import { DOSSIER, viderLimiteConnexion, NOM_SECRETARIAT, SANS_SESSION, respecterLimiteConnexion, seConnecterAvec, verifierUtilisateur } from "./aides-connexion";

test.use({ storageState: SANS_SESSION, viewport: { width: 1440, height: 1000 } });

test("UC01-04 : sans session on est renvoyé à la connexion, puis ramené à la page demandée", async ({ page }) => {
  test.setTimeout(150_000);
  await viderLimiteConnexion(page);

  await test.step("1. Ouvrir /app/impayes sans être connecté : la page de connexion s'affiche", async () => {
    await page.goto("/app/impayes");
    await expect(page).toHaveURL(/\/connexion\?retour=%2Fapp%2Fimpayes$/);
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await capture(page, DOSSIER, "UC01-04-01-redirection-connexion");
  });

  await test.step("2. Se connecter : la page demandée (Impayés) s'ouvre, pas le tableau de bord", async () => {
    await page.getByLabel("Adresse e-mail").fill(COMPTES.secretariat.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(COMPTES.secretariat.motDePasse);
    await respecterLimiteConnexion(page);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/app/impayes");
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants en retard de paiement" })).toBeVisible();
    await verifierUtilisateur(page, NOM_SECRETARIAT, "Secrétariat");
    await capture(page, DOSSIER, "UC01-04-02-page-demandee");
  });

  await test.step("3. Déjà connecté, ouvrir /connexion renvoie dans l'application", async () => {
    await page.goto("/connexion");
    await page.waitForURL("**/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  });

  await test.step("4. Une adresse de retour externe est ignorée", async () => {
    await page.context().clearCookies();
    await seConnecterAvec(page, COMPTES.secretariat.email, COMPTES.secretariat.motDePasse, "https://exemple.com");
    await page.waitForURL("**/app/dashboard");
    await expect(page).toHaveURL(/localhost:3200\/app\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    await capture(page, DOSSIER, "UC01-04-04-retour-externe-ignore");
  });

  await test.step("5. Sans session, « Retour au site » ouvre la page publique de l'institut", async () => {
    await page.context().clearCookies();
    await page.goto("/connexion");
    await page.getByRole("link", { name: "Retour au site" }).click();
    await page.waitForURL(/localhost:3200\/$/);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await capture(page, DOSSIER, "UC01-04-05-retour-au-site", page.getByRole("heading", { level: 1 }).first().locator("xpath=ancestor::section[1]"));
  });
});
