import { analyser, captureHaute, deposer, DOSSIER_UC15 as DOSSIER, effectifListe, fichier, messageRapport, ouvrirReprise } from "./aides-reprise";
import { capture, expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });
test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 900 } });

test("UC15-02. Un fichier avec des erreurs n'importe rien", async ({ page }) => {
  let effectifAvant = 0;

  await test.step("1. Compter les étudiants avant", async () => {
    effectifAvant = await effectifListe(page);
    expect(effectifAvant).toBeGreaterThan(0);
  });

  await test.step("2. Déposer le modèle tel quel : ses lignes d'exemple sont refusées", async () => {
    await ouvrirReprise(page);
    await deposer(page, [fichier("modele-import-ifspa-2026-2027.xlsx")]);
    await analyser(page);
    await expect(messageRapport(page)).toHaveText("6 erreurs : rien ne peut être importé. Corrigez le fichier, puis déposez-le à nouveau.");
    await expect(page.getByText("ligne d'exemple du modèle : remplacez-la par vos données ou supprimez-la.").first()).toBeVisible();
    await captureHaute(page, DOSSIER, "UC15-02-02-modele-tel-quel");
  });

  await test.step("3. Choisir un autre fichier : le classeur aux saisies fautives", async () => {
    await page.getByRole("button", { name: "Choisir un autre fichier" }).click();
    await deposer(page, [fichier("reprise-en-erreur.xlsx")]);
    await expect(page.getByRole("list", { name: "Fichiers choisis" })).toContainText("reprise-en-erreur.xlsx");
    await analyser(page);
    await expect(messageRapport(page)).toHaveText("12 erreurs : rien ne peut être importé. Corrigez le fichier, puis déposez-le à nouveau.");
    await expect(page.getByRole("heading", { name: "À corriger avant l'import (12)" })).toBeVisible();
    await expect(page.getByText("Étudiants, ligne 5, colonne « Date de naissance » (« 31/02/2006 ») : cette date n'existe pas.")).toBeVisible();
    await expect(page.getByText("filière inconnue (filières : IF, SF)")).toBeVisible();
    await expect(page.getByText("Paiements, ligne 5, colonne « N° étudiant » (« 9 ») : aucun étudiant ne porte ce N° dans la feuille Étudiants.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Importer \d/ })).toHaveCount(0);
    await captureHaute(page, DOSSIER, "UC15-02-03-rapport-erreurs");
  });

  await test.step("4. Aucun étudiant n'a été créé", async () => {
    expect(await effectifListe(page)).toBe(effectifAvant);
  });
});
