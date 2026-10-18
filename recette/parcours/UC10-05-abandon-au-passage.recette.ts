import {
  barreResume,
  choisirClasse,
  choisirDecision,
  decocher,
  DOSSIER_UC10 as DOSSIER,
  ETUDIANTS_SF as SF,
  ligneEtudiant,
  lienClasse,
  ouvrirAdmissions,
} from "./aides-admissions";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1000 } });

test("UC10-05 : une sage-femme abandonne au moment du passage", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Ouvrir la classe Sage-femmes 1re année et décocher RABEMANANJARA Lalaina", async () => {
    await ouvrirAdmissions(page);
    await choisirClasse(page, "Sage-femmes", "1re année");
    await expect(page.getByText("2 étudiants · passage en 2e année pour 2026-2027")).toBeVisible();
    await decocher(page, SF.lalaina);
    await expect(ligneEtudiant(page, SF.lalaina).getByRole("radio", { name: "Redouble" })).toBeChecked();
    await choisirDecision(page, SF.lalaina, "Abandon");
    await expect(barreResume(page)).toHaveText(/1 passe en 2e année\s*·\s*1 abandon/);
    await expect(page.getByRole("button", { name: "Valider les Sage-femmes 1re année" })).toBeEnabled();
    await capture(page, DOSSIER, "UC10-05-01-lalaina-abandon");
  });

  await test.step("2. La confirmation nomme l'étudiante qui abandonne", async () => {
    await page.getByRole("button", { name: "Valider les Sage-femmes 1re année" }).click();
    const dialogue = page.getByRole("dialog", { name: "Valider le passage des Sage-femmes 1re année ?" });
    await expect(dialogue).toContainText("2 étudiants · de 2025-2026 vers 2026-2027");
    await expect(dialogue.getByRole("list", { name: "Étudiants qui ne passent pas" })).toContainText("RABEMANANJARA Lalaina · SF-2025-0002");
    await expect(dialogue.getByRole("list", { name: "Étudiants qui ne passent pas" })).toContainText("Abandon");
    await expect(dialogue).toContainText("1 inscription 2026-2027 sera créée, avec leurs mensualités.");
    await expect(dialogue).toContainText("2 étudiants ont des impayés 2025-2026 : ils restent dus sur cette année.");
    await capture(page, DOSSIER, "UC10-05-02-confirmation", dialogue);
  });

  await test.step("3. Valider le passage de 2 étudiants", async () => {
    const dialogue = page.getByRole("dialog", { name: "Valider le passage des Sage-femmes 1re année ?" });
    await dialogue.getByRole("button", { name: "Valider le passage de 2 étudiants" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText("Sage-femmes 1re année validée : 1 passe en 2e année · 1 abandon.")).toBeVisible();
    await expect(lienClasse(page, "Sage-femmes", "1re année")).toContainText("Validée");
    await capture(page, DOSSIER, "UC10-05-03-apres-validation");
  });

  await test.step("4. Fiche de RABEMANANJARA Lalaina : abandon, date de sortie et motif", async () => {
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /RABEMANANJARA Lalaina/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RABEMANANJARA Lalaina");
    await expect(page.getByText(/Sorti · Abandon le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(page.getByText("SF-2025-0002", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Écolage 2026-2027/ })).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1300 });
    await capture(page, DOSSIER, "UC10-05-04-fiche-lalaina");
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.getByRole("tab", { name: /Parcours/ }).click();
    const parcours = page.getByRole("tabpanel");
    await expect(parcours).toContainText("Sortie : Abandon");
    await expect(parcours).toContainText(/Ne poursuit pas en 2026-2027 \(passage du \d{2}\/\d{2}\/\d{4}\)/);
    await expect(parcours).toContainText("2025-2026");
    await capture(page, DOSSIER, "UC10-05-04-parcours-lalaina");
  });

  await test.step("5. Fiche de RAZAFINDRAKOTO Mialy : admise en 2e année, même matricule", async () => {
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /RAZAFINDRAKOTO Mialy/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RAZAFINDRAKOTO Mialy");
    await expect(page.getByText("SF-2025-0001", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("2e année · 2026-2027")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 2e année" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1800 });
    await capture(page, DOSSIER, "UC10-05-05-fiche-mialy");
  });
});
