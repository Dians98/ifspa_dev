import { caseEtudiant, DOSSIER_UC10 as DOSSIER, ETUDIANTS_IF as IF, lienClasse, ouvrirAdmissions } from "./aides-admissions";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1000 } });

test("UC10-09 : l'administrateur annule un passage depuis l'historique, l'écran revient à 2025-2026", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Historique : trois passages dont un déjà annulé, « Annuler » sur les deux actifs", async () => {
    await ouvrirAdmissions(page);
    await expect(page.getByText("Fin de l'année 2026-2027 : décidez, classe par classe, qui passe en 2027-2028.")).toBeVisible();
    await page.getByRole("link", { name: "Historique" }).click();
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Annulé" })).toHaveCount(1);
    await expect(page.getByRole("row").filter({ hasText: "Actif" })).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^Annuler le passage / })).toHaveCount(2);
    await capture(page, DOSSIER, "UC10-09-01-historique-admin");
  });

  await test.step("2. Annuler le passage actif des Infirmier(e)s 1re année : la fenêtre dit ce qui sera restauré", async () => {
    await page.getByRole("button", { name: /^Annuler le passage Infirmier\(e\)s 1re année du / }).click();
    const dialogue = page.getByRole("dialog", { name: "Annuler ce passage ?" });
    await expect(dialogue).toContainText("Infirmier(e)s 1re année · 2025-2026 vers 2026-2027 · validé le");
    await expect(dialogue).toContainText("Aucun reçu n'existe sur ces nouvelles inscriptions : l'annulation est possible.");
    await expect(dialogue).toContainText("4 inscriptions créées en 2026-2027, avec leurs mensualités, sont supprimées.");
    await capture(page, DOSSIER, "UC10-09-02-fenetre", dialogue);
  });

  await test.step("3. Confirmer : le passage passe à « Annulé »", async () => {
    const dialogue = page.getByRole("dialog", { name: "Annuler ce passage ?" });
    await dialogue.getByRole("button", { name: "Annuler le passage" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText("Passage annulé : Infirmier(e)s 1re année est revenue à son état d'avant la validation.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Annulé" })).toHaveCount(2);
    await expect(page.getByRole("row").filter({ hasText: "Actif" })).toHaveCount(1);
    await capture(page, DOSSIER, "UC10-09-03-historique-apres");
  });

  await test.step("4. Classes : l'écran revient à la fin de 2025-2026, la classe est « À faire »", async () => {
    await page.getByRole("link", { name: "Classes" }).click();
    await expect(page.getByText("Fin de l'année 2025-2026 : décidez, classe par classe, qui passe en 2026-2027.")).toBeVisible();
    await expect(page.getByText("1 classe validée sur 2")).toBeVisible();
    await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("À faire");
    await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("4 étudiants");
    await expect(lienClasse(page, "Sage-femmes", "1re année")).toContainText("Validée");
    await page.getByRole("navigation", { name: "Classes" }).getByRole("region", { name: "Infirmier(e)s" }).getByRole("link", { name: /^1re année/ }).click();
    for (const nom of Object.values(IF)) await expect(caseEtudiant(page, nom)).toBeChecked();
    await capture(page, DOSSIER, "UC10-09-04-ecran-revenu-2025");
  });
});
