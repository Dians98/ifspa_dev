import { carte, choisirAnnee, DOSSIER_UC12 as DOSSIER, ouvrirDashboard, situation, tableau, totalTableau } from "./aides-dashboard";
import { lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { ouvrirAnnees } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1500 } });

// L'année en cours n'a aucun retard avant le 1er novembre : on rend 2025-2026 courante pour voir les liens, puis on rétablit.
test("UC12-10 : sur l'année en cours, les retards du tableau mènent à la liste des impayés, filtrée", async ({ page }) => {
  test.setTimeout(150_000);

  await test.step("1. Paramètres › Années scolaires : 2025-2026 devient l'année en cours", async () => {
    await ouvrirAnnees(page);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Définir 2025-2026 comme année courante" }).click();
    const confirmation = page.getByRole("alertdialog");
    await confirmation.getByRole("button", { name: "Définir comme année courante" }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByRole("button", { name: "Définir 2026-2027 comme année courante" })).toBeVisible();
  });

  await test.step("2. Tableau de bord : ouvert sur 2025-2026 « (en cours) », avec « Voir la liste des impayés »", async () => {
    await ouvrirDashboard(page);
    await expect(situation(page)).toContainText("année scolaire 2025-2026");
    await expect(page.getByRole("combobox", { name: "Année scolaire" })).toContainText("2025-2026 (en cours)");
    await expect(carte(page, "Étudiants en retard")).toContainText(/4\s+sur 5/);
    await expect(carte(page, "Étudiants en retard").getByRole("link", { name: "Voir la liste des impayés" })).toBeVisible();
    await capture(page, DOSSIER, "UC12-10-02-annee-en-cours");
  });

  await test.step("3. Le nombre d'étudiants en retard d'une classe est un lien : « 3 » sur Infirmier(e)s 1re année ouvre Impayés filtré", async () => {
    const lien = tableau(page).getByRole("link", { name: "3 étudiants en retard, voir la liste" }).first();
    await expect(lien).toBeVisible();
    await lien.click();
    await page.waitForURL(/\/app\/impayes\?filiereId=.*niveau=1/);
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants en retard de paiement" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Filière" })).toContainText("Infirmier(e)s");
    await expect(page.getByRole("combobox", { name: "Niveau" })).toContainText("1re année");
    // Impayés filtre sur le niveau actuel : Voahirana et Fanja sont passées en 2e année, seul Solofo (qui redouble) reste en 1re.
    await verifierSynthese(page, 1, 900_000);
    await expect(lignesImpayes(page)).toHaveCount(1);
    await expect(lignesImpayes(page)).toContainText("RANDRIAMAHEFA Solofo");
    await capture(page, DOSSIER, "UC12-10-03-impayes-classe");
  });

  await test.step("4. Le lien du total ouvre Impayés sans filtre : 4 étudiants, 3 160 000 Ar", async () => {
    await ouvrirDashboard(page);
    await totalTableau(page).getByRole("link", { name: "4 étudiants en retard, voir la liste" }).click();
    await page.waitForURL("**/app/impayes");
    await verifierSynthese(page, 4, 3_160_000);
    await capture(page, DOSSIER, "UC12-10-04-impayes-total");
  });

  await test.step("5. Sur 2026-2027, plus année en cours : plus aucun lien vers Impayés (la liste ne se filtre pas par année)", async () => {
    await ouvrirDashboard(page);
    await choisirAnnee(page, "2026-2027");
    await expect(carte(page, "Étudiants en retard").getByRole("link", { name: "Voir la liste des impayés" })).toHaveCount(0);
    await expect(tableau(page).getByRole("link")).toHaveCount(0);
    await capture(page, DOSSIER, "UC12-10-05-sans-lien");
  });

  await test.step("6. Rétablir 2026-2027 comme année courante", async () => {
    await ouvrirAnnees(page);
    await page.getByRole("button", { name: "Définir 2026-2027 comme année courante" }).click();
    const confirmation = page.getByRole("alertdialog");
    await confirmation.getByRole("button", { name: "Définir comme année courante" }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByRole("button", { name: "Définir 2025-2026 comme année courante" })).toBeVisible();
    await ouvrirDashboard(page);
    await expect(situation(page)).toContainText("année scolaire 2026-2027");
  });
});
