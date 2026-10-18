import { aujourdhui } from "./aides-sorties";
import { carte, derniers, DOSSIER_UC12 as DOSSIER, lignesDerniers, ligneClasse, numerosDerniers, ouvrirDashboard, RECUS, situation, sousTotal, tableau, totalTableau, verifierLigne } from "./aides-dashboard";
import { ouvrirPaiements, total, verifierTotal } from "./aides-paiements";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1500 } });

const NUL = { attendu: 0, encaisse: 0, reste: 0, taux: null, enRetard: 0 } as const;

test("UC12-01 : l'administrateur ouvre le tableau de bord le matin, sur l'année en cours", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Ouvrir le Tableau de bord : année 2026-2027, trois cartes", async () => {
    await ouvrirDashboard(page);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await expect(situation(page)).toHaveText(`Situation au ${aujourdhui().fr} · année scolaire 2026-2027`);
    await expect(page.getByRole("combobox", { name: "Filière" })).toContainText("Toutes les filières");
    await expect(page.getByRole("combobox", { name: "Année scolaire" })).toContainText("2026-2027 (en cours)");
    const effectif = carte(page, "Effectif actif");
    await expect(effectif).toContainText("4");
    await expect(effectif).toContainText("3 Infirmier(e)s · 1 Sage-femmes");
    const taux = carte(page, "Taux de recouvrement");
    await expect(taux).toContainText("—");
    await expect(taux).toContainText("Rien n'est encore échu");
    const retard = carte(page, "Étudiants en retard");
    await expect(retard).toContainText(/0\s+sur 4/);
    await expect(retard).toContainText("Personne n'a d'échéance impayée");
    await expect(retard.getByRole("link", { name: "Voir la liste des impayés" })).toBeVisible();
    await capture(page, DOSSIER, "UC12-01-01-cartes");
  });

  await test.step("2. Le tableau : une ligne par filière et par niveau, tout à 0 Ar (aucun mois n'est terminé)", async () => {
    await expect(tableau(page).getByText("Seules les échéances dont le mois est terminé comptent : un mois n'est en retard qu'à partir du 1er du suivant.")).toBeVisible();
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "1re année"), { effectif: 3, ...NUL });
    await verifierLigne(sousTotal(page, "Infirmier(e)s"), { effectif: 3, ...NUL });
    await verifierLigne(ligneClasse(page, "Sage-femmes", "1re année"), { effectif: 1, ...NUL });
    await verifierLigne(sousTotal(page, "Sage-femmes"), { effectif: 1, ...NUL });
    await verifierLigne(totalTableau(page), { effectif: 4, ...NUL });
    await expect(tableau(page)).toContainText("Rien n'est encore échu");
    await capture(page, DOSSIER, "UC12-01-02-tableau", tableau(page));
  });

  await test.step("3. Derniers paiements : les 10 plus récents, du R-2026-00032 au R-2026-00023", async () => {
    await expect(lignesDerniers(page)).toHaveCount(10);
    const numeros = await numerosDerniers(page);
    expect(numeros).toEqual([
      RECUS.faly, RECUS.hery, RECUS.helene, RECUS.nirina2, RECUS.voahirana2,
      RECUS.solofo, RECUS.lalaina, RECUS.mialy, RECUS.tiana, RECUS.nirina1,
    ]);
    await expect(derniers(page)).not.toContainText(RECUS.fanja);
    await expect(derniers(page)).not.toContainText(RECUS.voahirana1);
    const premiere = lignesDerniers(page).first();
    await expect(premiere).toContainText("ANDRIAMAMPIANINA Faly");
    await expect(premiere).toContainText("IF-2026-0003");
    await expect(premiere).toContainText(/100\s000\sAr/);
    await expect(premiere).toContainText("Espèces");
    await expect(premiere).toContainText("Hanitra RAKOTO");
    await expect(premiere).toContainText("Valide");
    await expect(derniers(page)).toContainText("Reçus les plus récents, toutes années confondues.");
    await capture(page, DOSSIER, "UC12-01-03-derniers-paiements", derniers(page));
  });

  await test.step("4. « Tous les paiements » : douze reçus, 1 954 000 Ar, les deux plus anciens sont là", async () => {
    await derniers(page).getByRole("link", { name: "Tous les paiements" }).click();
    await page.waitForURL("**/app/paiements");
    await ouvrirPaiements(page, "/app/paiements");
    await expect(total(page, "Reçus")).toContainText("12");
    await verifierTotal(page, "Total encaissé", 1_954_000);
    await expect(page.getByRole("link", { name: RECUS.fanja, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: RECUS.voahirana1, exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC12-01-04-paiements");
  });
});
