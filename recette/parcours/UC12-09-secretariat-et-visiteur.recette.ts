import { carte, choisirAnnee, derniers, DOSSIER_UC12 as DOSSIER, lignesDerniers, ouvrirDashboard, RECUS, totalTableau, verifierLigne } from "./aides-dashboard";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1500 } });

test("UC12-09 : la secrétaire voit le même tableau de bord que l'administrateur, un visiteur sans compte est renvoyé à la connexion", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);

  await test.step("1. Secrétariat : Tableau de bord dans le menu, aucune rubrique Paramètres", async () => {
    await page.goto("/app/encaisser");
    await page.getByRole("link", { name: "Tableau de bord" }).click();
    await page.waitForURL("**/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Secrétariat", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Paramètres" })).toHaveCount(0);
    await expect(carte(page, "Effectif actif")).toContainText("6 Infirmier(e)s · 1 Sage-femmes");
    await expect(carte(page, "Étudiants en retard").getByRole("link", { name: "Voir la liste des impayés" })).toBeVisible();
    await capture(page, DOSSIER, "UC12-09-01-secretariat-2026");
  });

  await test.step("2. Année 2025-2026 : mêmes chiffres que l'administrateur (29,3 %, 4 sur 5, total 4 920 000 Ar attendus)", async () => {
    await choisirAnnee(page, "2025-2026");
    await expect(carte(page, "Taux de recouvrement")).toContainText("29,3 %");
    await expect(carte(page, "Étudiants en retard")).toContainText(/4\s+sur 5/);
    await verifierLigne(totalTableau(page), { effectif: 5, attendu: 4_920_000, encaisse: 1_440_000, reste: 3_480_000, taux: "29,3 %", enRetard: 4 });
    await capture(page, DOSSIER, "UC12-09-02-secretariat-2025");
  });

  await test.step("3. Derniers paiements : le reçu annulé est visible, sans bouton « Annuler » ni autre action", async () => {
    await expect(lignesDerniers(page).filter({ hasText: RECUS.solofo })).toContainText("Annulé");
    await expect(derniers(page).getByRole("button")).toHaveCount(0);
    await expect(derniers(page).getByRole("link", { name: /Annuler/ })).toHaveCount(0);
    await capture(page, DOSSIER, "UC12-09-03-derniers", derniers(page));
  });

  await test.step("4. Un numéro de reçu ouvre le ticket, un nom d'étudiant ouvre sa fiche", async () => {
    await derniers(page).getByRole("link", { name: RECUS.faly, exact: true }).click();
    await page.waitForURL(/\/app\/paiements\/[^/]+\/recu$/);
    await expect(page.getByText(RECUS.faly).first()).toBeVisible();
    await capture(page, DOSSIER, "UC12-09-04-recu");
    await page.goBack();
    await derniers(page).getByRole("link", { name: "RAMAROSON Hery" }).click();
    await page.waitForURL(/\/app\/etudiants\/[^/?]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RAMAROSON");
  });

  await test.step("5. Sans compte : l'adresse /app/dashboard renvoie à la connexion, aucun chiffre n'est affiché", async () => {
    const visiteur = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const p = await visiteur.newPage();
      await p.goto("/app/dashboard");
      await p.waitForURL(/\/connexion/);
      await expect(p.getByRole("heading", { name: /Connexion/ }).first()).toBeVisible();
      await expect(p.getByText("Taux de recouvrement")).toHaveCount(0);
      await capture(p, DOSSIER, "UC12-09-05-visiteur");
    } finally {
      await visiteur.close();
    }
  });
});
