import { analyser, captureHaute, deposer, DOSSIER_UC15 as DOSSIER, effectifListe, fichier, messageRapport, ouvrirReprise } from "./aides-reprise";
import { expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });
test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 900 } });

test("UC15-05. Un paiement au-delà du reste dû est refusé, et avec lui tout l'import", async ({ page }) => {
  let effectifAvant = 0;

  await test.step("1. Compter les étudiants avant", async () => {
    effectifAvant = await effectifListe(page);
  });

  await test.step("2. Déposer le classeur : 950 000 Ar pour 900 000 Ar dus, 500 000 Ar deux fois, et un paiement exact", async () => {
    await ouvrirReprise(page);
    await deposer(page, [fichier("reprise-trop-percu.xlsx")]);
    await analyser(page);
  });

  await test.step("3. Le rapport refuse les deux paiements fautifs et ferme l'import", async () => {
    await expect(page.getByRole("heading", { name: "À corriger avant l'import (2)" })).toBeVisible();
    await expect(messageRapport(page)).toContainText("2 erreurs : rien ne peut être importé.");
    await expect(page.getByRole("button", { name: /^Importer \d/ })).toHaveCount(0);
    await page.getByText("Paiements par étudiant (3)").click();
    const recap = page.getByRole("table").last();
    await expect(recap.getByRole("row", { name: /RASOLOFOMANANA Voahangy/ })).toContainText("500 000 Ar");
    await expect(recap.getByRole("row", { name: /RASOLOFOMANANA Voahangy/ })).toContainText("400 000 Ar");
    await expect(recap.getByRole("row", { name: /RAKOTOMANANA Zo Lalaina/ })).toContainText("900 000 Ar");
    await captureHaute(page, DOSSIER, "UC15-05-03-rapport-trop-percu");
  });

  await test.step("4. Aucun étudiant n'a été créé, même celui dont le paiement est exact", async () => {
    expect(await effectifListe(page)).toBe(effectifAvant);
  });
});
