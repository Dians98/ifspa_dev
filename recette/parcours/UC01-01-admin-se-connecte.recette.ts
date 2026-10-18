import { COMPTES } from "../../e2e/app/comptes";
import { capture, expect, test } from "./outils";
import { DOSSIER, viderLimiteConnexion, NOM_ADMIN, SANS_SESSION, respecterLimiteConnexion, saisirIdentifiants, verifierUtilisateur } from "./aides-connexion";

test.use({ storageState: SANS_SESSION, viewport: { width: 1440, height: 1000 } });

test("UC01-01 : l'administrateur se connecte et retrouve tous les écrans", async ({ page }) => {
  test.setTimeout(120_000);
  await viderLimiteConnexion(page);
  const barre = page.getByRole("complementary", { name: "Barre latérale" });

  await test.step("1. Ouvrir la page de connexion", async () => {
    await page.goto("/connexion");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await expect(page.getByText("Espace du personnel : gérez les étudiants et l'écolage.")).toBeVisible();
    await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
    await expect(page.getByLabel("Mot de passe", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour au site" })).toBeVisible();
    await expect(page.getByText("Les comptes sont créés et réinitialisés par l'administrateur. Mot de passe perdu ? Adressez-vous à lui.")).toBeVisible();
    await capture(page, DOSSIER, "UC01-01-01-page-connexion");
  });

  await test.step("2. Saisir l'adresse et le mot de passe de l'administrateur", async () => {
    await saisirIdentifiants(page, COMPTES.admin.email, COMPTES.admin.motDePasse);
    await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveAttribute("type", "password");
    await capture(page, DOSSIER, "UC01-01-02-identifiants-saisis");
  });

  await test.step("3. Cliquer « Se connecter » : le tableau de bord s'ouvre", async () => {
    await respecterLimiteConnexion(page);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    await verifierUtilisateur(page, NOM_ADMIN, "Administrateur");
    await capture(page, DOSSIER, "UC01-01-03-tableau-de-bord");
  });

  await test.step("4. Le menu propose tous les écrans, Paramètres compris", async () => {
    const menu = page.getByRole("navigation", { name: "Menu principal" });
    for (const nom of ["Tableau de bord", "Étudiants", "Passage en année supérieure", "Encaisser", "Paiements", "Impayés", "Paramètres"]) {
      await expect(menu.getByRole("link", { name: nom, exact: true })).toBeVisible();
    }
    for (const groupe of ["Pilotage", "Scolarité", "Écolage", "Administration"]) {
      await expect(menu.getByText(groupe, { exact: true })).toBeVisible();
    }
    await expect(menu.locator('[aria-current="page"]')).toHaveText(/Tableau de bord/);
    await capture(page, DOSSIER, "UC01-01-04-menu-administrateur", barre);
  });

  await test.step("5. Ouvrir Paramètres : les cinq sections sont proposées", async () => {
    await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Paramètres", exact: true }).click();
    await page.waitForURL("**/app/parametres/**");
    await expect(page.getByRole("heading", { level: 1, name: "Paramètres" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    const onglets = page.getByRole("navigation", { name: "Sections des paramètres" });
    for (const nom of ["Filières", "Années scolaires", "Tarifs", "Utilisateurs", "Reprise des données"]) {
      await expect(onglets.getByRole("link", { name: nom, exact: true })).toBeVisible();
    }
    await capture(page, DOSSIER, "UC01-01-05-parametres");
  });
});
