import { captureHaute, DOSSIER_UC15 as DOSSIER } from "./aides-reprise";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 900 } });

test("UC15-07. Le secrétariat n'a pas accès à la reprise des données", async ({ page, browser, baseURL }) => {
  await test.step("1. Le menu du secrétariat n'a pas de rubrique Paramètres", async () => {
    await page.goto("/app/etudiants");
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Paramètres" })).toHaveCount(0);
    await captureHaute(page, DOSSIER, "UC15-07-01-menu-secretariat");
  });

  await test.step("2. L'adresse /app/parametres/import affiche « Accès réservé »", async () => {
    await page.goto("/app/parametres/import");
    await expect(page.getByText("Accès réservé à l'administrateur")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choisir le fichier" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Télécharger le modèle Excel" })).toHaveCount(0);
    await captureHaute(page, DOSSIER, "UC15-07-02-acces-reserve");
  });

  await test.step("3. Le modèle n'est pas servi au secrétariat : 403 dans le navigateur", async () => {
    const reponse = await page.goto("/api/import/modele?format=xlsx");
    expect(reponse?.status()).toBe(403);
    await expect(page.locator("body")).toContainText('{"erreur":"Cette action est réservée à l\'administrateur.","code":"INTERDIT"}');
    await capture(page, DOSSIER, "UC15-07-03-modele-403");
  });

  await test.step("4. Sans connexion : 401 dans le navigateur", async () => {
    const contexte = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const anonyme = await contexte.newPage();
    const reponse = await anonyme.goto("/api/import/modele?format=xlsx");
    expect(reponse?.status()).toBe(401);
    await expect(anonyme.locator("body")).toContainText('{"erreur":"Session expirée : reconnectez-vous.","code":"SESSION"}');
    await capture(anonyme, DOSSIER, "UC15-07-04-modele-401");
    await contexte.close();
  });
});
