import { capture, expect, test } from "./outils";
import { DOSSIER, viderLimiteConnexion, NOM_ADMIN, NOM_SECRETARIAT, SANS_SESSION, connecterAdmin, connecterSecretariat, verifierUtilisateur } from "./aides-connexion";

test.use({ storageState: SANS_SESSION, viewport: { width: 1440, height: 1000 } });

test("UC01-05 : se déconnecter ferme l'accès, un autre compte peut ouvrir sa session sur le même poste", async ({ page }) => {
  test.setTimeout(150_000);
  await viderLimiteConnexion(page);

  await test.step("1. Le secrétariat est connecté et ouvre Paiements", async () => {
    await connecterSecretariat(page);
    await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Paiements", exact: true }).click();
    await page.waitForURL("**/app/paiements");
    await expect(page.getByRole("heading", { level: 1, name: "Paiements" })).toBeVisible();
    await verifierUtilisateur(page, NOM_SECRETARIAT, "Secrétariat");
    await capture(page, DOSSIER, "UC01-05-01-connecte");
  });

  await test.step("2. Cliquer « Se déconnecter » : retour à la page de connexion", async () => {
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL("**/connexion");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await expect(page.getByLabel("Adresse e-mail")).toHaveValue("");
    await capture(page, DOSSIER, "UC01-05-02-deconnecte");
  });

  await test.step("3. Le bouton « Précédent » du navigateur ne rouvre pas la page Paiements", async () => {
    await page.goBack();
    await page.waitForURL(/\/connexion/);
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Paiements" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC01-05-03-precedent-refuse");
  });

  await test.step("4. Taper l'adresse /app/etudiants : la connexion est redemandée", async () => {
    await page.goto("/app/etudiants");
    await expect(page).toHaveURL(/\/connexion\?retour=%2Fapp%2Fetudiants$/);
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
  });

  await test.step("5. L'administrateur se connecte à son tour : la barre affiche son nom, pas celui de la secrétaire", async () => {
    await connecterAdmin(page);
    await verifierUtilisateur(page, NOM_ADMIN, "Administrateur");
    await expect(page.getByText(NOM_SECRETARIAT, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Paramètres", exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC01-05-05-autre-compte");
  });
});
