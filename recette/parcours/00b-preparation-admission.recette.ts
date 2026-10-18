import { ETUDIANTS } from "./aides";
import { capture, expect, SESSIONS, test } from "./outils";

// Complète 00-preparation pour UC06 : la classe IF 1re année de 2025-2026 passe en 2e année en 2026-2027,
// ses étudiants gardent donc leurs impayés de 2025-2026 et en ont de nouveaux en 2026-2027.
const DOSSIER = "00-preparation";

test.use({ viewport: { width: 1440, height: 1500 }, storageState: SESSIONS.secretariat });

test("passer la classe IF 1re année de 2025-2026 en 2e année", async ({ page }) => {
  await test.step("14. Ouvrir Passage en année supérieure, classe Infirmier(e)s 1re année", async () => {
    await page.goto("/app/admissions");
    await expect(page.getByRole("heading", { level: 1, name: "Passage en année supérieure" })).toBeVisible();
    await page.getByRole("navigation", { name: "Classes" }).getByRole("link", { name: /1re année/ }).first().click();
    await expect(page.getByRole("heading", { level: 2, name: "Infirmier(e)s 1re année" })).toBeVisible();
    await expect(page.getByText("4 passent en 2e année")).toBeVisible();
    await capture(page, DOSSIER, "P-11-admissions-if");
  });

  await test.step("15. Valider le passage des quatre étudiants", async () => {
    await page.getByRole("button", { name: "Valider les Infirmier(e)s 1re année" }).click();
    const dialogue = page.getByRole("dialog", { name: /Valider le passage/ });
    await capture(page, DOSSIER, "P-12-admissions-confirmation", dialogue);
    await dialogue.getByRole("button", { name: "Valider le passage de 4 étudiants" }).click();
    await expect(page.getByText(/validée : 4 passent en 2e année/)).toBeVisible();
    await expect(dialogue).toBeHidden();
  });

  await test.step("16. La fiche de RAKOTOMALALA Voahirana montre deux années", async () => {
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /RAKOTOMALALA Voahirana/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(ETUDIANTS.voahirana.nom);
    await expect(page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 2e année" })).toBeVisible();
    await expect(page.getByText(/1\s800\s000\sAr/).first()).toBeVisible();
    await capture(page, DOSSIER, "P-13-fiche-deux-annees");
  });
});
