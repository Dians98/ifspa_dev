import { DOSSIER_UC05 as DOSSIER } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 900 } });

test("UC05-06 : une adresse d'étudiant qui n'existe pas affiche la page « Étudiant introuvable »", async ({ page }) => {
  test.setTimeout(90_000);

  await test.step("1. Ouvrir /app/etudiants/inconnu : « Étudiant introuvable »", async () => {
    await page.goto("/app/etudiants/etudiant-qui-n-existe-pas");
    await expect(page.getByRole("heading", { level: 1, name: "Étudiant introuvable" })).toBeVisible();
    await expect(page.getByText("Cet étudiant n'existe pas ou plus. Retrouvez-le par son nom ou son matricule dans la liste des étudiants.")).toBeVisible();
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC05-06-01-introuvable");
  });

  await test.step("2. « Retour aux étudiants » ramène à la liste", async () => {
    await page.getByRole("link", { name: "Retour aux étudiants" }).click();
    await expect(page).toHaveURL(/\/app\/etudiants$/);
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants" })).toBeVisible();
  });

  await test.step("3. La page Modifier d'un étudiant inconnu est introuvable aussi", async () => {
    await page.goto("/app/etudiants/etudiant-qui-n-existe-pas/modifier");
    await expect(page.getByRole("heading", { level: 1, name: "Étudiant introuvable" })).toBeVisible();
  });
});
