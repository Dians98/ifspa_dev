import { A, B, D, DOSSIER, nomComplet, ouvrirFiche, resume } from "./aides-az";
import { barreResume, caseEtudiant, choisirClasse, decocher, ligneEtudiant, lienClasse, ouvrirAdmissions } from "./aides-admissions";
import { capture, expect, SESSIONS, test } from "./outils";

// Acte 6 : l'administrateur prépare 2026-2027, le secrétariat fait passer la classe IF 1re année (D redouble), l'administrateur change d'année courante.
test.describe.configure({ mode: "serial" });

test.describe("Acte 6 : administrateur prépare 2026-2027", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

  test("6.1 à 6.2 créer l'année et ses tarifs", async ({ page }) => {
    await test.step("6.1 Nouvelle année : 2026", async () => {
      await page.goto("/app/parametres/annees");
      await expect(page.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "Nouvelle année" }).first().click();
      const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
      await dialogue.getByLabel("Année de début").fill("2026");
      await expect(dialogue.getByText(/Année 2026-2027 : mensualités de/)).toBeVisible();
      await dialogue.getByRole("button", { name: "Créer l'année" }).click();
      await expect(dialogue).toBeHidden();
      await expect(page.getByText("Année 2026-2027 créée, en préparation. Saisissez maintenant ses tarifs.")).toBeVisible();
      await capture(page, DOSSIER, "AZ-6-1-annee-creee");
    });

    await test.step("6.2 Tarifs 2026-2027 : IF 1re année et IF 2e année", async () => {
      await page.getByRole("link", { name: "Tarifs de l'année 2026-2027" }).click();
      await page.waitForURL("**/app/parametres/tarifs?annee=*");
      await page.getByLabel("Droits d'inscription, IF 1re année").fill("100 000");
      await page.getByLabel("Mensualité, IF 1re année").fill("80 000");
      await page.getByLabel("Droits d'inscription, IF 2e année").fill("110 000");
      await page.getByLabel("Mensualité, IF 2e année").fill("85 000");
      await expect(page.getByLabel("Nombre de mois, IF 2e année")).toHaveValue("10");
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Modifiez directement les montants dans le tableau.")).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Mensualité, IF 2e année")).toHaveValue(/85\s000/);
      await capture(page, DOSSIER, "AZ-6-2-tarifs-2026");
    });
  });
});

test.describe("Acte 6 : secrétariat fait passer la classe", () => {
  test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });

  test("6.3 à 6.5 passage de la classe IF 1re année", async ({ page }) => {
    await test.step("6.3 Passage en année supérieure : IF 1re année, trois étudiants cochés", async () => {
      await ouvrirAdmissions(page);
      await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
      await choisirClasse(page, "Infirmier(e)s", "1re année");
      await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("3 étudiants");
      await expect(lienClasse(page, "Sage-femmes", "1re année")).toContainText("Aucun étudiant");
      for (const e of [A, B, D]) await expect(caseEtudiant(page, nomComplet(e))).toBeChecked();
      await capture(page, DOSSIER, "AZ-6-3-classe-cochee");
    });

    await test.step("6.4 Décocher D : il redouble", async () => {
      await decocher(page, nomComplet(D));
      await expect(ligneEtudiant(page, nomComplet(D)).getByRole("radio", { name: "Redouble" })).toBeChecked();
      await expect(barreResume(page)).toHaveText(/2 passent en 2e année\s*·\s*1 redouble/);
      await capture(page, DOSSIER, "AZ-6-4-d-redouble");
    });

    await test.step("6.5 Valider : confirmation nominative, puis passage fait", async () => {
      await page.getByRole("button", { name: "Valider les Infirmier(e)s 1re année" }).click();
      const dialogue = page.getByRole("dialog", { name: "Valider le passage des Infirmier(e)s 1re année ?" });
      await expect(dialogue).toContainText("3 étudiants · de 2025-2026 vers 2026-2027");
      await expect(dialogue).toContainText("ANDRIANARISOA Tiana · IF-2025-0003");
      await expect(dialogue).toContainText("3 inscriptions 2026-2027 seront créées, avec leurs mensualités.");
      await expect(dialogue).toContainText("2 étudiants ont des impayés 2025-2026 : ils restent dus sur cette année.");
      await capture(page, DOSSIER, "AZ-6-5-confirmation", dialogue);
      await dialogue.getByRole("button", { name: "Valider le passage de 3 étudiants" }).click();
      await expect(dialogue).toBeHidden();
      await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("Validée");
      await capture(page, DOSSIER, "AZ-6-5b-passage-valide");
    });

    await test.step("6.6 La fiche de A montre deux années", async () => {
      await ouvrirFiche(page, A);
      await expect(page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 2e année" })).toBeVisible();
      await expect(resume(page, "Reste à payer")).toContainText("960 000 Ar");
      await capture(page, DOSSIER, "AZ-6-6-fiche-a");
    });

    await test.step("6.7 La fiche de D : il redouble la 1re année", async () => {
      await ouvrirFiche(page, D);
      await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 1re année" })).toBeVisible();
      await expect(resume(page, "Reste à payer")).toContainText("1 700 000 Ar");
      await capture(page, DOSSIER, "AZ-6-7-fiche-d");
    });
  });
});

test.describe("Acte 6 : administrateur change d'année courante", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

  test("6.8 2026-2027 devient l'année courante", async ({ page }) => {
    await page.goto("/app/parametres/annees");
    await page.getByRole("button", { name: "Définir 2026-2027 comme année courante" }).click();
    const confirmation = page.getByRole("alertdialog");
    await confirmation.getByRole("button", { name: "Définir comme année courante" }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByRole("button", { name: "Définir 2025-2026 comme année courante" })).toBeVisible();
    await capture(page, DOSSIER, "AZ-6-8-annee-courante");
  });
});
