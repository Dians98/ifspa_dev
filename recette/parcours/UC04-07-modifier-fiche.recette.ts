import { INSCRITS } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";
const { fanja } = INSCRITS;

test.use({ storageState: SESSIONS.secretariat });
test.use({ viewport: { width: 1440, height: 1300 } });

test("UC04-07 : corriger le téléphone et l'adresse, matricule et filière restent verrouillés", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Ouvrir la fiche de RASOANAIVO Fanja, onglet Identité", async () => {
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /RASOANAIVO Fanja/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RASOANAIVO Fanja");
    await page.getByRole("tab", { name: "Identité" }).click();
    await expect(page.getByText("034 00 000 02")).toBeVisible();
    await capture(page, DOSSIER, "UC04-07-01-identite");
  });

  await test.step("2. « Modifier » : l'identité est modifiable, quatre informations sont verrouillées", async () => {
    await page.getByRole("link", { name: "Modifier" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Modifier l'étudiant" })).toBeVisible();
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("RASOANAIVO");
    await expect(page.getByLabel("Téléphone", { exact: true })).toHaveValue("0340000002");
    await expect(page.getByText("Informations verrouillées")).toBeVisible();
    await expect(page.getByText("IF-2026-0002", { exact: true })).toBeVisible();
    await expect(page.getByText("Année d'entrée")).toBeVisible();
    await expect(page.getByLabel("Matricule")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /Infirmier/ })).toHaveCount(0);
    await capture(page, DOSSIER, "UC04-07-02-formulaire-modification");
  });

  await test.step("3. Téléphone vidé : l'enregistrement est refusé", async () => {
    await page.getByLabel("Téléphone", { exact: true }).fill("");
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page.getByText("Indiquez le numéro de téléphone.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Modifier l'étudiant" })).toBeVisible();
    await capture(page, DOSSIER, "UC04-07-03-telephone-vide");
  });

  await test.step("4. Nouveau téléphone et nouvelle adresse : « Fiche enregistrée. »", async () => {
    await page.getByLabel("Téléphone", { exact: true }).fill("034 00 000 22");
    await page.getByLabel("Adresse").fill("Lot 45 bis, Ampasimazava, Toamasina");
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page.getByText("Fiche enregistrée.")).toBeVisible();
    await page.waitForURL(/\/app\/etudiants\/[^/?]+$/);
    await capture(page, DOSSIER, "UC04-07-04-fiche-enregistree");
  });

  await test.step("5. L'onglet Identité montre les nouvelles coordonnées, le matricule n'a pas bougé", async () => {
    await page.getByRole("tab", { name: "Identité" }).click();
    await expect(page.getByText("034 00 000 22")).toBeVisible();
    await expect(page.getByText("Lot 45 bis, Ampasimazava, Toamasina")).toBeVisible();
    await expect(page.getByText(fanja.matricule, { exact: true }).first()).toBeVisible();
    await capture(page, DOSSIER, "UC04-07-05-identite-modifiee");
  });
});
