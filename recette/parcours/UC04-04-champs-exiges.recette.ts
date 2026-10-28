import { INSCRITS } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";
const { solofo } = INSCRITS;

test.use({ storageState: SESSIONS.secretariat });
test.use({ viewport: { width: 1440, height: 1300 } });

test("UC04-04 : champs exigés et saisies refusées, rien n'est créé", async ({ page }) => {
  test.setTimeout(120_000);
  const inscrire = page.getByRole("button", { name: "Inscrire l'étudiant" });

  await test.step("1. Formulaire vide : « Inscrire l'étudiant » signale chaque champ exigé", async () => {
    await page.goto("/app/etudiants/nouveau");
    await inscrire.click();
    for (const message of [
      "Indiquez le nom.",
      "Indiquez les prénoms.",
      "Indiquez le sexe.",
      "Indiquez la date de naissance.",
      "Indiquez le lieu de naissance.",
      "Indiquez le numéro de téléphone.",
      "Indiquez l'adresse.",
      "Choisissez la filière.",
    ]) {
      await expect(page.getByText(message, { exact: true })).toBeVisible();
    }
    await expect(page).toHaveURL(/\/app\/etudiants\/nouveau$/);
    await capture(page, DOSSIER, "UC04-04-01-formulaire-vide");
  });

  await test.step("2. Téléphone et adresse laissés vides : l'inscription est refusée", async () => {
    await page.goto("/app/etudiants/nouveau");
    await page.getByLabel("Nom", { exact: true }).fill(solofo.nom);
    await page.getByLabel("Prénoms").fill(solofo.prenoms);
    await page.getByRole("radio", { name: solofo.sexe }).click();
    await page.getByLabel("Date de naissance").fill(solofo.naissance);
    await page.getByLabel("Lieu de naissance").fill(solofo.lieu);
    await page.getByRole("radio", { name: /Infirmier\(e\)s/ }).click();
    await inscrire.click();
    await expect(page.getByText("Indiquez le numéro de téléphone.", { exact: true })).toBeVisible();
    await expect(page.getByText("Indiquez l'adresse.", { exact: true })).toBeVisible();
    await expect(page.getByText("Indiquez le nom.", { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/etudiants\/nouveau$/);
    await capture(page, DOSSIER, "UC04-04-02-telephone-adresse-vides");
  });

  await test.step("3. Numéro de téléphone mal formé", async () => {
    await page.getByLabel("Téléphone", { exact: true }).fill("034 12");
    await page.getByLabel("Adresse").fill(solofo.adresse);
    await inscrire.click();
    await expect(
      page.getByText("Numéro malgache attendu : 10 chiffres commençant par 032 à 038 (ex. 034 12 345 67).", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/app\/etudiants\/nouveau$/);
    await capture(page, DOSSIER, "UC04-04-03-telephone-invalide");
  });

  await test.step("4. Date de naissance dans le futur", async () => {
    await page.getByLabel("Téléphone", { exact: true }).fill(solofo.telephone);
    await page.getByLabel("Date de naissance").fill("2030-01-01");
    await inscrire.click();
    await expect(page.getByText("La date de naissance doit être passée.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/etudiants\/nouveau$/);
    await capture(page, DOSSIER, "UC04-04-04-naissance-future");
  });

  await test.step("5. La liste n'a gagné aucun étudiant : toujours cinq inscrits", async () => {
    await page.goto("/app/etudiants");
    await expect(page.getByText("5 étudiants inscrits")).toBeVisible();
    await expect(page.getByText(solofo.nom)).toHaveCount(0);
    await capture(page, DOSSIER, "UC04-04-05-liste-inchangee");
  });
});
