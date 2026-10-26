import { carte, choisirAnnee, ouvrirDashboard, situation, tableau } from "./aides-dashboard";
import { ADMIN, ligneParametre, ouvrirAnnees } from "./aides-parametres";
import { DOSSIER } from "./aides-az";
import { capture, expect, SESSIONS, test } from "./outils";

// Acte 9 : l'administrateur clôture 2025-2026 et regarde le tableau de bord final.
test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1500 } });

test("Acte 9 : clôturer 2025-2026, tableau de bord final", async ({ page }) => {
  await test.step("9.1 Clôturer l'année 2025-2026 : la confirmation", async () => {
    await ouvrirAnnees(page);
    await expect(page.getByText(ADMIN).first()).toBeVisible();
    await page.getByRole("button", { name: "Clôturer l'année 2025-2026" }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("Clôturer l'année 2025-2026 ?");
    await expect(confirmation).toContainText("Les impayés de cette année restent encaissables");
    await capture(page, DOSSIER, "AZ-9-1-confirmer-cloture", confirmation);
  });

  await test.step("9.2 Confirmer : 2025-2026 est clôturée", async () => {
    await page.getByRole("alertdialog").getByRole("button", { name: "Clôturer l'année" }).click();
    await expect(page.getByText("Année 2025-2026 clôturée. Ses impayés restent encaissables.")).toBeVisible();
    await expect(ligneParametre(page, /^2025-2026/)).toContainText("Clôturée");
    await capture(page, DOSSIER, "AZ-9-2-annee-cloturee");
  });

  await test.step("9.3 Tableau de bord de l'année courante 2026-2027", async () => {
    await ouvrirDashboard(page);
    await expect(situation(page)).toContainText("année scolaire 2026-2027");
    await expect(carte(page, "Effectif actif")).toContainText("4 Infirmier(e)s");
    await expect(carte(page, "Taux de recouvrement")).toContainText("Rien n'est encore échu");
    await expect(carte(page, "Étudiants en retard")).toContainText(/0\s+sur 4/);
    await expect(tableau(page)).toContainText("2e année");
    await capture(page, DOSSIER, "AZ-9-3-tableau-de-bord-2026");
  });

  await test.step("9.4 Tableau de bord de 2025-2026", async () => {
    await choisirAnnee(page, "2025-2026");
    await expect(situation(page)).toContainText("année scolaire 2025-2026");
    await expect(carte(page, "Effectif actif")).toContainText("3 Infirmier(e)s · 0 Sage-femmes");
    await expect(carte(page, "Taux de recouvrement")).toContainText("45,3 %");
    await expect(carte(page, "Taux de recouvrement")).toContainText(/1\s400\s000\sAr encaissés sur 3\s090\s000\sAr attendus à date/);
    await expect(carte(page, "Étudiants en retard")).toContainText(/2\s+sur 3/);
    await capture(page, DOSSIER, "AZ-9-4-tableau-de-bord-2025");
  });
});
