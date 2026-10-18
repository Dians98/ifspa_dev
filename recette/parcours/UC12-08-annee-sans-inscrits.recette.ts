import { carte, choisirAnnee, DOSSIER_UC12 as DOSSIER, lignesDerniers, ouvrirDashboard, situation, tableau } from "./aides-dashboard";
import { ouvrirAnnees } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

test("UC12-08 : une année scolaire sans inscrit affiche un tableau de bord vide, avec un chemin vers les admissions", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Paramètres › Années scolaires : créer l'année 2027-2028 (sans inscrit)", async () => {
    await ouvrirAnnees(page);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Nouvelle année" }).click();
    const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
    await dialogue.getByLabel("Année de début").fill("2027");
    await expect(dialogue.getByText(/Année 2027-2028 : mensualités de/)).toBeVisible();
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByRole("link", { name: "Tarifs de l'année 2027-2028" })).toBeVisible();
  });

  await test.step("2. Tableau de bord : le sélecteur propose 2027-2028, l'année en cours reste 2026-2027", async () => {
    await ouvrirDashboard(page);
    await page.getByRole("combobox", { name: "Année scolaire" }).click();
    await expect(page.getByRole("option")).toHaveText([/^2027-2028$/, /^2026-2027 \(en cours\)$/, /^2025-2026$/]);
    await capture(page, DOSSIER, "UC12-08-02-choix-annee");
    // La capture pleine page referme la liste : on la rouvre si besoin.
    const option = page.getByRole("option", { name: /^2027-2028/ });
    if (!(await option.isVisible())) await page.getByRole("combobox", { name: "Année scolaire" }).click();
    await option.click();
    await expect(page).toHaveURL(/anneeId=/);
  });

  await test.step("3. Année 2027-2028 : effectif 0, taux « — », tableau remplacé par « Aucun étudiant n'est encore inscrit sur cette année scolaire. »", async () => {
    await expect(situation(page)).toContainText("année scolaire 2027-2028");
    await expect(carte(page, "Effectif actif")).toContainText("0");
    await expect(carte(page, "Effectif actif")).toContainText("Aucun étudiant inscrit sur cette année");
    await expect(carte(page, "Taux de recouvrement")).toContainText("—");
    await expect(carte(page, "Taux de recouvrement")).toContainText("Rien n'est encore échu");
    await expect(carte(page, "Étudiants en retard")).toContainText(/0\s+sur 0/);
    await expect(carte(page, "Étudiants en retard").getByRole("link", { name: "Voir la liste des impayés" })).toHaveCount(0);
    await expect(page.getByText("Aucun étudiant n'est encore inscrit sur cette année scolaire.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Aller aux admissions" })).toBeVisible();
    await expect(tableau(page).locator("tfoot")).toHaveCount(0);
    await capture(page, DOSSIER, "UC12-08-03-annee-vide");
  });

  await test.step("4. Les derniers paiements restent affichés (toutes années confondues)", async () => {
    await expect(lignesDerniers(page)).toHaveCount(10);
  });

  await test.step("5. « Aller aux admissions » ouvre le passage en année supérieure", async () => {
    await page.getByRole("link", { name: "Aller aux admissions" }).click();
    await page.waitForURL("**/app/admissions");
    await expect(page.getByRole("heading", { level: 1, name: "Passage en année supérieure" })).toBeVisible();
    await capture(page, DOSSIER, "UC12-08-05-admissions");
  });

  await test.step("6. Retour sur 2026-2027 par le sélecteur", async () => {
    await ouvrirDashboard(page, "/app/dashboard");
    await expect(situation(page)).toContainText("année scolaire 2026-2027");
    await choisirAnnee(page, "2025-2026");
  });
});
