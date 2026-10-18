import { analyser, captureHaute, deposer, DOSSIER_UC15 as DOSSIER, fabriquerFichiers, fichier, messageRapport, ouvrirReprise } from "./aides-reprise";
import { capture, expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });
test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 900 } });

test("UC15-01. Reprise nominale d'un classeur Excel rempli", async ({ page }) => {
  await test.step("1. Ouvrir Paramètres › Reprise des données", async () => {
    await ouvrirReprise(page);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Sections des paramètres" }).getByRole("link", { name: "Reprise des données" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "Analyser le fichier" })).toBeDisabled();
    await captureHaute(page, DOSSIER, "UC15-01-01-ecran");
  });

  await test.step("2. Télécharger le modèle Excel", async () => {
    const [telechargement] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Télécharger le modèle Excel" }).click(),
    ]);
    expect(telechargement.suggestedFilename()).toBe("modele-import-ifspa-2026-2027.xlsx");
    await telechargement.saveAs(fichier("modele-import-ifspa-2026-2027.xlsx"));
    // Les fichiers d'essai sont les lignes d'exemple de ce modèle remplacées par celles de l'institut.
    fabriquerFichiers();
  });

  await test.step("3. Déposer le classeur rempli", async () => {
    await deposer(page, [fichier("reprise-ifspa-2026-2027.xlsx")]);
    await expect(page.getByRole("list", { name: "Fichiers choisis" })).toContainText("reprise-ifspa-2026-2027.xlsx");
    await expect(page.getByRole("button", { name: "Analyser le fichier" })).toBeEnabled();
    await captureHaute(page, DOSSIER, "UC15-01-03-fichier-depose");
  });

  await test.step("4. Analyser le fichier : rien n'est encore écrit", async () => {
    await analyser(page);
    await expect(messageRapport(page)).toHaveText("Prêt à importer 6 nouveaux étudiants et 7 paiements.");
    await expect(page.getByText("6 nouveaux", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("main")).toContainText(/7 à importer, soit\s*687\s000\sAr/);
    await expect(page.getByRole("heading", { name: "À vérifier (1)" })).toBeVisible();
    await expect(page.getByText("paiement Mobile Money sans référence : il sera importé sans référence.")).toBeVisible();
    await captureHaute(page, DOSSIER, "UC15-01-04-rapport");
  });

  await test.step("5. Ouvrir « Paiements par étudiant »", async () => {
    await page.getByText("Paiements par étudiant (5)").click();
    const tableau = page.getByRole("table").last();
    await expect(tableau).toContainText("720 000 Ar");
    await expect(tableau).toContainText("753 000 Ar");
    await expect(tableau).toContainText("850 000 Ar");
    await expect(tableau).toContainText("770 000 Ar");
    await captureHaute(page, DOSSIER, "UC15-01-05-paiements-par-etudiant");
  });

  await test.step("6. Importer : une seule confirmation", async () => {
    await page.getByRole("button", { name: "Importer 6 étudiants et 7 paiements" }).click();
    const dialogue = page.getByRole("alertdialog");
    await expect(dialogue).toContainText("Importer 6 étudiants et 7 paiements ?");
    await expect(dialogue).toContainText("Un import ne s'annule pas.");
    await capture(page, DOSSIER, "UC15-01-06-confirmation", dialogue);
    await dialogue.getByRole("button", { name: "Importer maintenant" }).click();
  });

  await test.step("7. Le résumé : matricules et reçus", async () => {
    await expect(page.getByRole("heading", { name: "Import terminé" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("main").getByText(/^Import terminé : 6 étudiants créés, 7 paiements enregistrés pour 687\s000\sAr \(reçus R-2026-00001 à R-2026-00007\)\.$/)).toBeVisible();
    for (const m of ["IF-2025-0001", "IF-2026-0001", "IF-2026-0002", "SF-2025-0001", "SF-2025-0002", "SF-2026-0001"]) {
      await expect(page.getByRole("link", { name: m, exact: true })).toBeVisible();
    }
    await captureHaute(page, DOSSIER, "UC15-01-07-resume");
  });

  await test.step("8. Voir les étudiants : six fiches créées", async () => {
    await page.getByRole("link", { name: "Voir les étudiants" }).click();
    await expect(page.getByText("6 étudiants inscrits")).toBeVisible();
    await expect(page.getByRole("link", { name: /RANAIVOSOA Lova Hasina/ })).toBeVisible();
    await expect(page.getByText("1re année (redoublant)")).toBeVisible();
    await captureHaute(page, DOSSIER, "UC15-01-08-liste-etudiants");
  });

  await test.step("9. La fiche de RANDRIANASOLO : écolage repris, reste dû exact", async () => {
    await page.getByRole("link", { name: /RANDRIANASOLO Haingo Mirana/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RANDRIANASOLO");
    await expect(page.getByText("Matricule IF-2026-0001")).toBeVisible();
    await expect(page.getByText(/Reste à payer\s*753\s000\sAr/)).toBeVisible();
    await expect(page.getByText(/Déjà payé\s*147\s000\sAr/)).toBeVisible();
    await expect(page.getByText("Droits payés en 3 fois")).toBeVisible();
    await expect(page.getByText("Écolage 2026-2027 · 1re année")).toBeVisible();
    await captureHaute(page, DOSSIER, "UC15-01-09-fiche-ecolage");
  });

  await test.step("10. L'onglet Paiements de la fiche : deux reçus datés du jour du fichier, à 12:00", async () => {
    await page.getByRole("tab", { name: "Paiements (2)" }).click();
    const lignes = page.getByRole("row");
    await expect(lignes.filter({ hasText: "R-2026-00007" })).toContainText("15/10/2026");
    await expect(lignes.filter({ hasText: "R-2026-00007" })).toContainText("33 000 Ar");
    await expect(lignes.filter({ hasText: "R-2026-00007" })).toContainText("Orange Money");
    await expect(lignes.filter({ hasText: "R-2026-00002" })).toContainText("05/10/2026");
    await expect(lignes.filter({ hasText: "R-2026-00002" })).toContainText("12:00");
    await expect(lignes.filter({ hasText: "R-2026-00002" })).toContainText("114 000 Ar");
    await expect(lignes.filter({ hasText: "R-2026-00002" })).toContainText("Administrateur IFSPA");
    await captureHaute(page, DOSSIER, "UC15-01-10-fiche-paiements");
  });

  await test.step("11. Réimprimer le reçu R-2026-00002", async () => {
    await page.getByRole("link", { name: "Réimprimer le reçu R-2026-00002" }).click();
    await page.waitForURL(/\/recu/);
    const ticket = page.getByRole("article", { name: /^Reçu R-2026-00002/ });
    await expect(ticket).toBeVisible();
    await expect(ticket).toContainText("RANDRIANASOLO Haingo Mirana");
    await expect(ticket).toContainText("Droits — tranche 1/3");
    await expect(ticket).toContainText("114 000 Ar");
    await expect(ticket).toContainText("Arrêté à : cent quatorze mille ariary");
    await expect(ticket).toContainText("Reste à payer");
    await expect(ticket).toContainText("786 000 Ar");
    await capture(page, DOSSIER, "UC15-01-11-ticket-reimprime", ticket);
  });

  await test.step("12. Paiements : sept reçus pour 687 000 Ar", async () => {
    await page.goto("/app/paiements?periode=mois");
    await expect(page.getByText("Octobre 2026", { exact: true })).toBeVisible();
    await expect(page.getByText(/Reçus 1 à 7 sur 7/)).toBeVisible();
    await expect(page.getByText(/687\s000\sAr/).first()).toBeVisible();
    await captureHaute(page, DOSSIER, "UC15-01-12-paiements");
  });
});
