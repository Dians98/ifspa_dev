import { aujourdhui } from "./aides-sorties";
import { carte, choisirAnnee, choisirFiliere, derniers, DOSSIER_UC12 as DOSSIER, ligneClasse, montantRegex, numerosDerniers, ouvrirDashboard, RECUS, situation, sousTotal, tableau, totalTableau, verifierLigne } from "./aides-dashboard";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1500 } });

test("UC12-03 : la directrice regarde une filière à la fois, et les derniers paiements suivent la filière", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Année 2025-2026 puis filière Infirmier(e)s : quatre étudiants, 16,4 %", async () => {
    await ouvrirDashboard(page);
    await choisirAnnee(page, "2025-2026");
    await choisirFiliere(page, "Infirmier(e)s");
    await expect(page).toHaveURL(/anneeId=.*filiereId=|filiereId=.*anneeId=/);
    await expect(situation(page)).toHaveText(`Situation au ${aujourdhui().fr} · année scolaire 2025-2026 · Infirmier(e)s`);
    await expect(carte(page, "Effectif actif")).toContainText("4");
    await expect(carte(page, "Effectif actif")).toContainText("4 Infirmier(e)s");
    await expect(carte(page, "Effectif actif")).not.toContainText("Sage-femmes");
    const taux = carte(page, "Taux de recouvrement");
    await expect(taux).toContainText("16,4 %");
    await expect(taux).toContainText(new RegExp(`${montantRegex(590_000).source} encaissés sur ${montantRegex(3_600_000).source} attendus à date`));
    await expect(carte(page, "Étudiants en retard")).toContainText(/4\s+sur 4/);
    await expect(tableau(page).getByText("Sage-femmes")).toHaveCount(0);
    await expect(sousTotal(page, "Infirmier(e)s")).toHaveCount(0);
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "1re année"), { effectif: 4, attendu: 3_600_000, encaisse: 590_000, reste: 3_010_000, taux: "16,4 %", enRetard: 4 });
    await verifierLigne(totalTableau(page), { effectif: 4, attendu: 3_600_000, encaisse: 590_000, reste: 3_010_000, taux: "16,4 %", enRetard: 4 });
    await capture(page, DOSSIER, "UC12-03-01-infirmiers-2025");
  });

  await test.step("2. Derniers paiements de la filière : les 9 reçus des Infirmier(e)s, y compris ceux de 2026-2027", async () => {
    await expect(derniers(page)).toContainText("Reçus les plus récents · Infirmier(e)s, toutes années confondues.");
    expect(await numerosDerniers(page)).toEqual([
      RECUS.faly, RECUS.hery, RECUS.nirina2, RECUS.voahirana2, RECUS.solofo, RECUS.tiana, RECUS.nirina1, RECUS.fanja, RECUS.voahirana1,
    ]);
    await expect(derniers(page)).not.toContainText("Sage-femmes");
    await expect(derniers(page)).not.toContainText(RECUS.mialy);
    await capture(page, DOSSIER, "UC12-03-02-derniers-infirmiers", derniers(page));
  });

  await test.step("3. Filière Sage-femmes : deux étudiantes, 52,8 %, une seule en retard, trois reçus", async () => {
    await choisirFiliere(page, "Sage-femmes");
    await expect(situation(page)).toContainText("année scolaire 2025-2026 · Sage-femmes");
    await expect(carte(page, "Effectif actif")).toContainText("2 Sage-femmes");
    await expect(carte(page, "Taux de recouvrement")).toContainText("52,8 %");
    await expect(carte(page, "Étudiants en retard")).toContainText(/1\s+sur 2/);
    await verifierLigne(totalTableau(page), { effectif: 2, attendu: 1_800_000, encaisse: 950_000, reste: 850_000, taux: "52,8 %", enRetard: 1 });
    expect(await numerosDerniers(page)).toEqual([RECUS.helene, RECUS.lalaina, RECUS.mialy]);
    await capture(page, DOSSIER, "UC12-03-03-sage-femmes-2025");
  });

  await test.step("4. Sage-femmes sur l'année 2026-2027 : une étudiante, rien d'échu, mais le reçu de 2026-2027 est dans la liste", async () => {
    await choisirAnnee(page, "2026-2027");
    await expect(situation(page)).toContainText("année scolaire 2026-2027 · Sage-femmes");
    await expect(carte(page, "Effectif actif")).toContainText("1 Sage-femmes");
    await expect(carte(page, "Taux de recouvrement")).toContainText("—");
    await expect(carte(page, "Étudiants en retard")).toContainText(/0\s+sur 1/);
    await expect(carte(page, "Étudiants en retard").getByRole("link", { name: "Voir la liste des impayés" })).toBeVisible();
    expect(await numerosDerniers(page)).toEqual([RECUS.helene, RECUS.lalaina, RECUS.mialy]);
    await capture(page, DOSSIER, "UC12-03-04-sage-femmes-2026");
  });

  await test.step("5. « Toutes les filières » : retour aux quatre étudiants de 2026-2027, l'année reste choisie", async () => {
    await choisirFiliere(page, "Toutes les filières");
    await expect(page).not.toHaveURL(/filiereId=/);
    await expect(page).toHaveURL(/anneeId=/);
    await expect(situation(page)).toHaveText(`Situation au ${aujourdhui().fr} · année scolaire 2026-2027`);
    await expect(carte(page, "Effectif actif")).toContainText("3 Infirmier(e)s · 1 Sage-femmes");
    await expect(derniers(page).locator("tbody tr")).toHaveCount(10);
    await capture(page, DOSSIER, "UC12-03-05-toutes-filieres");
  });
});
