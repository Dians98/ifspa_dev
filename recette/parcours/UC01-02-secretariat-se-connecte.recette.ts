import { COMPTES } from "../../e2e/app/comptes";
import { capture, expect, test } from "./outils";
import { DOSSIER, viderLimiteConnexion, NOM_SECRETARIAT, SANS_SESSION, seConnecterAvec, verifierUtilisateur } from "./aides-connexion";

test.use({ storageState: SANS_SESSION, viewport: { width: 1440, height: 1000 } });

test("UC01-02 : le secrétariat se connecte, sans accès aux Paramètres", async ({ page }) => {
  test.setTimeout(120_000);
  await viderLimiteConnexion(page);
  const barre = page.getByRole("complementary", { name: "Barre latérale" });
  const menu = page.getByRole("navigation", { name: "Menu principal" });

  await test.step("1. Se connecter avec le compte secrétariat", async () => {
    await seConnecterAvec(page, COMPTES.secretariat.email, COMPTES.secretariat.motDePasse);
    await page.waitForURL("**/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    await verifierUtilisateur(page, NOM_SECRETARIAT, "Secrétariat");
    await capture(page, DOSSIER, "UC01-02-01-tableau-de-bord");
  });

  await test.step("2. Le menu ne propose pas Paramètres", async () => {
    for (const nom of ["Tableau de bord", "Étudiants", "Passage en année supérieure", "Encaisser", "Paiements", "Impayés"]) {
      await expect(menu.getByRole("link", { name: nom, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole("link", { name: "Paramètres", exact: true })).toHaveCount(0);
    await expect(menu.getByText("Administration", { exact: true })).toHaveCount(0);
    await capture(page, DOSSIER, "UC01-02-02-menu-secretariat", barre);
  });

  await test.step("3. Taper l'adresse /app/parametres : « Accès réservé à l'administrateur »", async () => {
    await page.goto("/app/parametres");
    await expect(page.getByRole("heading", { level: 1, name: "Accès réservé à l'administrateur" })).toBeVisible();
    await expect(
      page.getByText("Les paramètres (filières, années scolaires, tarifs et comptes utilisateurs) ne peuvent être modifiés que par un administrateur. Si un réglage doit changer, adressez-vous à lui."),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Sections des paramètres" })).toHaveCount(0);
    await verifierUtilisateur(page, NOM_SECRETARIAT, "Secrétariat");
    await capture(page, DOSSIER, "UC01-02-03-parametres-refuses");
  });

  await test.step("4. Même refus pour /app/parametres/utilisateurs", async () => {
    await page.goto("/app/parametres/utilisateurs");
    await expect(page.getByRole("heading", { level: 1, name: "Accès réservé à l'administrateur" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nouvel utilisateur" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC01-02-04-utilisateurs-refuses");
  });

  await test.step("5. « Retour au tableau de bord » ramène dans l'application", async () => {
    await page.getByRole("link", { name: "Retour au tableau de bord" }).click();
    await page.waitForURL("**/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  });
});
