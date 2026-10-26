import { A, B, C, D, DOSSIER, inscrireAZ, resume } from "./aides-az";
import { remplirInscription } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

// Acte 2 : le secrétariat inscrit quatre étudiants de 2025-2026, dans l'ordre (les matricules en dépendent).
test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });

test("Acte 2 : le secrétariat inscrit A, B, C et D", async ({ page }) => {
  await test.step("2.1 Inscrire A : RAKOTOMALALA Voahirana, IF, droits en 1 fois", async () => {
    await inscrireAZ(page, A);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" })).toBeVisible();
    await expect(resume(page, "Reste à payer")).toContainText("900 000 Ar");
    await expect(resume(page, "Dont en retard")).toContainText("900 000 Ar");
    await capture(page, DOSSIER, "AZ-2-1-fiche-a");
  });

  await test.step("2.2 Remplir B : RASOANAIVO Fanja, IF, droits en 3 fois", async () => {
    await remplirInscription(page, B);
    await expect(page.getByText("IF-2025-0002", { exact: true }).first()).toBeVisible();
    await capture(page, DOSSIER, "AZ-2-2-formulaire-b");
  });

  await test.step("2.3 Inscrire B", async () => {
    await page.getByRole("button", { name: "Inscrire l'étudiant" }).click();
    await page.waitForURL(/\/app\/etudiants\/[^/]+\?nouveau=1/);
    await expect(page.getByText(`Étudiant inscrit sous le matricule ${B.matricule}`)).toBeVisible();
    await expect(resume(page, "Reste à payer")).toContainText("900 000 Ar");
    await capture(page, DOSSIER, "AZ-2-3-fiche-b");
  });

  await test.step("2.4 Inscrire C : RAZAFINDRAKOTO Mialy, SF", async () => {
    await inscrireAZ(page, C);
    await expect(resume(page, "Reste à payer")).toContainText("1 020 000 Ar");
    await capture(page, DOSSIER, "AZ-2-4-fiche-c");
  });

  await test.step("2.5 Inscrire D : ANDRIANARISOA Tiana, IF", async () => {
    await inscrireAZ(page, D);
    await expect(resume(page, "Reste à payer")).toContainText("900 000 Ar");
    await capture(page, DOSSIER, "AZ-2-5-fiche-d");
  });

  await test.step("2.6 La liste des étudiants", async () => {
    await page.goto("/app/etudiants");
    for (const e of [A, B, C, D]) await expect(page.getByText(e.matricule, { exact: true }).first()).toBeVisible();
    await capture(page, DOSSIER, "AZ-2-6-liste");
  });
});
