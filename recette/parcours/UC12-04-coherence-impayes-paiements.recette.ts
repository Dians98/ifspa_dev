import { carte, choisirAnnee, choisirFiliere, DOSSIER_UC12 as DOSSIER, montantRegex, ouvrirDashboard, totalTableau, verifierLigne } from "./aides-dashboard";
import { choisirFiltreImpayes, lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { ouvrirPaiements, rechercher, total, verifierTotal } from "./aides-paiements";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1500 } });

test("UC12-04 : le tableau de bord, Impayés et Paiements racontent la même histoire", async ({ page }) => {
  test.setTimeout(150_000);

  await test.step("1. Tableau de bord 2025-2026 : 5 étudiants en retard sur 6, 3 860 000 Ar de reste", async () => {
    await ouvrirDashboard(page);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await choisirAnnee(page, "2025-2026");
    await expect(carte(page, "Étudiants en retard")).toContainText(/5\s+sur 6/);
    await verifierLigne(totalTableau(page), { effectif: 6, attendu: 5_400_000, encaisse: 1_540_000, reste: 3_860_000, taux: "28,5 %", enRetard: 5 });
    await capture(page, DOSSIER, "UC12-04-01-dashboard");
  });

  await test.step("2. Impayés : 5 étudiants, 3 860 000 Ar à recouvrer, les mêmes chiffres", async () => {
    await page.getByRole("link", { name: "Impayés", exact: true }).click();
    await page.waitForURL("**/app/impayes");
    await ouvrirImpayes(page);
    await verifierSynthese(page, 5, 3_860_000);
    await expect(lignesImpayes(page)).toHaveCount(5);
    await expect(page.getByRole("region", { name: "Liste des étudiants en retard" })).not.toContainText("RAZAFINDRAKOTO Mialy");
    await capture(page, DOSSIER, "UC12-04-02-impayes");
  });

  await test.step("3. Impayés filtré sur Infirmier(e)s : 4 étudiants, 3 010 000 Ar ; sur Sage-femmes : 1 étudiante, 850 000 Ar", async () => {
    await choisirFiltreImpayes(page, "Filière", "Infirmier(e)s");
    await verifierSynthese(page, 4, 3_010_000);
    await capture(page, DOSSIER, "UC12-04-03-impayes-infirmiers");
    await choisirFiltreImpayes(page, "Filière", "Sage-femmes");
    await verifierSynthese(page, 1, 850_000);
    await expect(lignesImpayes(page)).toContainText("RABEMANANJARA Lalaina");
    await capture(page, DOSSIER, "UC12-04-03-impayes-sage-femmes");
  });

  await test.step("4. Même filière au tableau de bord : Infirmier(e)s 3 010 000 Ar et 4 en retard, Sage-femmes 850 000 Ar et 1", async () => {
    await ouvrirDashboard(page);
    await choisirAnnee(page, "2025-2026");
    await choisirFiliere(page, "Infirmier(e)s");
    await verifierLigne(totalTableau(page), { effectif: 4, attendu: 3_600_000, encaisse: 590_000, reste: 3_010_000, taux: "16,4 %", enRetard: 4 });
    await choisirFiliere(page, "Sage-femmes");
    await verifierLigne(totalTableau(page), { effectif: 2, attendu: 1_800_000, encaisse: 950_000, reste: 850_000, taux: "52,8 %", enRetard: 1 });
  });

  await test.step("5. Année en cours 2026-2027 : « 0 sur 4 », mais « Voir la liste des impayés » ouvre les 5 retardataires de 2025-2026", async () => {
    await ouvrirDashboard(page);
    await expect(carte(page, "Étudiants en retard")).toContainText(/0\s+sur 4/);
    await capture(page, DOSSIER, "UC12-04-05-carte-en-cours", carte(page, "Étudiants en retard"));
    await carte(page, "Étudiants en retard").getByRole("link", { name: "Voir la liste des impayés" }).click();
    await page.waitForURL("**/app/impayes");
    await verifierSynthese(page, 5, 3_860_000);
    await capture(page, DOSSIER, "UC12-04-05-impayes-depuis-la-carte");
  });

  await test.step("6. Paiements : 12 reçus, 1 954 000 Ar = 1 540 000 Ar (2025-2026) + 414 000 Ar (2026-2027, pas encore échus)", async () => {
    await ouvrirPaiements(page);
    await expect(total(page, "Reçus")).toContainText("12");
    await verifierTotal(page, "Total encaissé", 1_954_000);
    await rechercher(page, "IF-2026");
    await expect(total(page, "Reçus")).toContainText("4");
    await verifierTotal(page, "Total encaissé", 380_000);
    await capture(page, DOSSIER, "UC12-04-06-paiements-if-2026");
    await rechercher(page, "SF-2026");
    await expect(total(page, "Reçus")).toContainText("1");
    await verifierTotal(page, "Total encaissé", 34_000);
    expect(380_000 + 34_000).toBe(414_000);
    expect(1_540_000 + 414_000).toBe(1_954_000);
  });
});
