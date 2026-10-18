import { analyser, captureHaute, DOSSIER_UC15 as DOSSIER, effectifListe, fabriquerFichiers, fichier, messageRapport, ouvrirReprise } from "./aides-reprise";
import { capture, expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });
test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 900 } });

test("UC15-06. Sans Excel : deux fichiers CSV", async ({ page }) => {
  let avant = 0;

  await test.step("1. Télécharger « CSV Étudiants » et « CSV Paiements »", async () => {
    avant = await effectifListe(page);
    await ouvrirReprise(page);
    for (const [lien, nom] of [
      ["CSV Étudiants", "modele-etudiants-2026-2027.csv"],
      ["CSV Paiements", "modele-paiements-2026-2027.csv"],
    ]) {
      const [telechargement] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: lien }).click()]);
      await telechargement.saveAs(fichier(nom));
    }
    fabriquerFichiers();
  });

  await test.step("2. Choisir le CSV des étudiants, puis celui des paiements", async () => {
    const entree = page.locator('input[type="file"]');
    await entree.setInputFiles([fichier("etudiants-2026-2027.csv")]);
    await expect(page.getByRole("button", { name: "Analyser le fichier" })).toBeEnabled();
    await entree.setInputFiles([fichier("paiements-2026-2027.csv")]);
    const liste = page.getByRole("list", { name: "Fichiers choisis" });
    await expect(liste).toContainText("etudiants-2026-2027.csv");
    await expect(liste).toContainText("paiements-2026-2027.csv");
    await expect(page.getByRole("button", { name: "Analyser les fichiers" })).toBeEnabled();
    await captureHaute(page, DOSSIER, "UC15-06-02-deux-fichiers");
  });

  await test.step("3. Analyser les fichiers", async () => {
    await analyser(page);
    await expect(messageRapport(page)).toHaveText("Prêt à importer 2 nouveaux étudiants et 2 paiements.");
    await captureHaute(page, DOSSIER, "UC15-06-03-rapport");
  });

  await test.step("4. Importer", async () => {
    await page.getByRole("button", { name: "Importer 2 étudiants et 2 paiements" }).click();
    const dialogue = page.getByRole("alertdialog");
    await dialogue.getByRole("button", { name: "Importer maintenant" }).click();
    await expect(page.getByRole("heading", { name: "Import terminé" })).toBeVisible({ timeout: 30_000 });
    await captureHaute(page, DOSSIER, "UC15-06-04-resume");
  });

  await test.step("5. Les deux étudiants s'ajoutent à la liste", async () => {
    expect(await effectifListe(page)).toBe(avant + 2);
    await expect(page.getByRole("link", { name: /RAKOTOZAFY Njaka/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /RANDRIANTSIMBA Mahery Tsiky/ })).toBeVisible();
    await capture(page, DOSSIER, "UC15-06-05-liste-etudiants");
  });
});
