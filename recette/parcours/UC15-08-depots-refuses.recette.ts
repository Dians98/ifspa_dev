import { analyser, captureHaute, deposer, DOSSIER_UC15 as DOSSIER, fichier, ouvrirReprise } from "./aides-reprise";
import { expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });
test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 900 } });

test("UC15-08. Les dépôts impossibles sont refusés avec un message clair", async ({ page }) => {
  const alerte = (texte: string) => page.getByRole("alert").filter({ hasText: texte });

  await test.step("1. Un ancien classeur .xls est refusé avant l'envoi", async () => {
    await ouvrirReprise(page);
    await deposer(page, [fichier("liste-etudiants-ancienne.xls")]);
    await expect(alerte("ancien format Excel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyser le fichier" })).toBeDisabled();
    await captureHaute(page, DOSSIER, "UC15-08-01-xls");
  });

  await test.step("2. Un fichier de plus de 1 Mo est refusé avant l'envoi", async () => {
    await page.getByRole("button", { name: "Retirer liste-etudiants-ancienne.xls" }).click();
    await deposer(page, [fichier("trop-gros.csv")]);
    await expect(alerte("trop volumineux")).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyser le fichier" })).toBeDisabled();
    await captureHaute(page, DOSSIER, "UC15-08-02-trop-gros");
  });

  await test.step("3. Un classeur et un CSV ensemble sont refusés avant l'envoi", async () => {
    await page.getByRole("button", { name: "Retirer trop-gros.csv" }).click();
    await deposer(page, [fichier("reprise-ifspa-2026-2027.xlsx"), fichier("etudiants-incomplet.csv")]);
    await expect(alerte("pas un mélange")).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyser les fichiers" })).toBeDisabled();
    await captureHaute(page, DOSSIER, "UC15-08-03-melange");
  });

  await test.step("4. Un texte enregistré en .xlsx est refusé par le serveur, rien n'est lu", async () => {
    await page.reload();
    await deposer(page, [fichier("faux-classeur.xlsx")]);
    await page.getByRole("button", { name: "Analyser le fichier" }).click();
    await expect(alerte("n'est pas un classeur .xlsx lisible")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rapport de contrôle" })).toHaveCount(0);
    await captureHaute(page, DOSSIER, "UC15-08-04-faux-classeur");
  });
});
