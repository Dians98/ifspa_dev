import { analyser, captureHaute, deposer, DOSSIER_UC15 as DOSSIER, effectifListe, fichier, messageRapport, ouvrirReprise } from "./aides-reprise";
import { capture, expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });
test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 900 } });

test("UC15-03. Relancer un fichier déjà importé ne crée aucun doublon", async ({ page }) => {
  await test.step("1. Déposer de nouveau le classeur d'UC15-01 et l'analyser", async () => {
    expect(await effectifListe(page)).toBe(6);
    await ouvrirReprise(page);
    await deposer(page, [fichier("reprise-ifspa-2026-2027.xlsx")]);
    await analyser(page);
    await expect(messageRapport(page)).toHaveText("Prêt à importer 0 nouvel étudiant et 0 paiement.");
  });

  await test.step("2. Rien de nouveau : le bouton d'import est grisé", async () => {
    await expect(page.getByText("Rien de nouveau à importer : tout est déjà en base.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Importer 0 étudiant et 0 paiement" })).toBeDisabled();
    await captureHaute(page, DOSSIER, "UC15-03-02-rien-de-nouveau");
  });

  await test.step("3. Choisir un autre fichier : le même classeur complété d'un septième étudiant et de son paiement", async () => {
    await page.getByRole("button", { name: "Choisir un autre fichier" }).click();
    await deposer(page, [fichier("reprise-complement.xlsx")]);
    await analyser(page);
    await expect(messageRapport(page)).toHaveText("Prêt à importer 1 nouvel étudiant et 1 paiement.");
    await page.getByText(/Paiements par étudiant/).click();
    await captureHaute(page, DOSSIER, "UC15-03-03-complement");
  });

  await test.step("4. Importer : seul le nouveau est créé", async () => {
    await page.getByRole("button", { name: "Importer 1 étudiant et 1 paiement" }).click();
    const dialogue = page.getByRole("alertdialog");
    await capture(page, DOSSIER, "UC15-03-04-confirmation", dialogue);
    await dialogue.getByRole("button", { name: "Importer maintenant" }).click();
    await expect(page.getByRole("heading", { name: "Import terminé" })).toBeVisible({ timeout: 30_000 });
    await captureHaute(page, DOSSIER, "UC15-03-04-resume");
  });

  await test.step("5. Sept étudiants, huit reçus : rien n'est doublé", async () => {
    expect(await effectifListe(page)).toBe(7);
    await page.goto("/app/paiements?periode=mois");
    await expect(page.getByText(/Reçus 1 à 8 sur 8/)).toBeVisible();
    await captureHaute(page, DOSSIER, "UC15-03-05-paiements");
  });
});
