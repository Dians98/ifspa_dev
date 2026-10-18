import { analyser, captureHaute, deposer, DOSSIER_UC15 as DOSSIER, fichier, messageRapport, ouvrirReprise } from "./aides-reprise";
import { capture, expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });
test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 900 } });

async function analyserLeFichier(page: import("@playwright/test").Page) {
  await ouvrirReprise(page);
  await deposer(page, [fichier("reprise-annee-absente-tarif-manquant.xlsx")]);
  await analyser(page);
}

test("UC15-04. Année d'entrée absente, filière inconnue, tarif manquant : on prépare les Paramètres, puis le fichier passe", async ({ page }) => {
  await test.step("1. Analyser le classeur : l'année 2024-2025 n'existe pas, la filière KI non plus", async () => {
    await analyserLeFichier(page);
    await captureHaute(page, DOSSIER, "UC15-04-01-erreurs");
  });

  await test.step("2. Paramètres › Filières : ajouter la filière KI", async () => {
    await page.goto("/app/parametres/filieres");
    await page.getByRole("button", { name: "Ajouter une filière" }).first().click();
    const dialogue = page.getByRole("dialog", { name: "Ajouter une filière" });
    await dialogue.getByLabel("Code").fill("KI");
    await dialogue.getByLabel("Nom de la filière").fill("Kinésithérapeutes");
    await capture(page, DOSSIER, "UC15-04-02-filiere", dialogue);
    await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText("Kinésithérapeutes").first()).toBeVisible();
  });

  await test.step("3. Analyser de nouveau : le tarif de KI 1re année manque", async () => {
    await analyserLeFichier(page);
    await captureHaute(page, DOSSIER, "UC15-04-03-tarif-manquant");
  });

  await test.step("4. Paramètres › Années scolaires : créer 2024-2025 et la clôturer", async () => {
    await page.goto("/app/parametres/annees");
    await page.getByRole("button", { name: "Nouvelle année" }).click();
    const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
    await dialogue.getByLabel("Année de début").fill("2024");
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue).toBeHidden();
    await page.getByRole("button", { name: "Clôturer l'année 2024-2025" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Clôturer l'année" }).click();
    await expect(page.getByRole("button", { name: "Rouvrir l'année 2024-2025" })).toBeVisible();
    await captureHaute(page, DOSSIER, "UC15-04-04-annees");
  });

  await test.step("5. Paramètres › Tarifs : saisir KI 1re année en 2026-2027", async () => {
    await page.goto("/app/parametres/tarifs");
    await page.getByLabel("Droits d'inscription, KI 1re année").fill("100 000");
    await page.getByLabel("Mensualité, KI 1re année").fill("80 000");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.reload();
    await expect(page.getByLabel("Mensualité, KI 1re année")).toHaveValue(/80\s000/);
    await captureHaute(page, DOSSIER, "UC15-04-05-tarifs");
  });

  await test.step("6. Analyser une dernière fois : le fichier est prêt, rien n'est importé", async () => {
    await analyserLeFichier(page);
    await expect(messageRapport(page)).toHaveText("Prêt à importer 3 nouveaux étudiants et 1 paiement.");
    await captureHaute(page, DOSSIER, "UC15-04-06-pret");
  });
});
