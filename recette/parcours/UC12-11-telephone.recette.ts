import { carte, choisirAnnee, choisirFiliere, derniers, DOSSIER_UC12 as DOSSIER, ligneClasse, ouvrirDashboard, sousTotal, tableau, totalTableau, verifierLigne } from "./aides-dashboard";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat });

// À lancer avec `--project mobile`, après UC12-10 (année en cours 2026-2027 rétablie). Ne modifie rien.
test("UC12-11 : la secrétaire lit le tableau de bord sur son téléphone", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Cas téléphone : lancer avec --project mobile.");
  test.setTimeout(120_000);

  await test.step("1. Ouvrir le Tableau de bord sur téléphone : les filtres et les trois cartes s'empilent", async () => {
    await ouvrirDashboard(page);
    await expect(page.getByRole("combobox", { name: "Filière" })).toBeVisible();
    await expect(carte(page, "Effectif actif")).toContainText("7");
    await expect(carte(page, "Taux de recouvrement")).toContainText("—");
    await expect(carte(page, "Étudiants en retard")).toContainText(/0\s+sur 7/);
    for (const nom of ["Filière", "Année scolaire"]) {
      const boite = await page.getByRole("combobox", { name: nom }).boundingBox();
      expect.soft(boite?.height ?? 0, `hauteur du sélecteur « ${nom} »`).toBeGreaterThanOrEqual(44);
    }
    const lien = await carte(page, "Étudiants en retard").getByRole("link", { name: "Voir la liste des impayés" }).boundingBox();
    expect.soft(lien?.height ?? 0, "hauteur du lien « Voir la liste des impayés »").toBeGreaterThanOrEqual(44);
    await capture(page, DOSSIER, "UC12-11-01-cartes", page.getByRole("region", { name: "Indicateurs" }));
  });

  await test.step("2. Le tableau devient une carte par classe, avec l'intitulé de chaque chiffre", async () => {
    await expect(tableau(page)).toContainText("Attendu à date");
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "1re année"), { effectif: 4, attendu: 0, encaisse: 0, reste: 0, taux: null, enRetard: 0 });
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "2e année"), { effectif: 2, attendu: 0, encaisse: 0, reste: 0, taux: null, enRetard: 0 });
    await tableau(page).scrollIntoViewIfNeeded();
    await capture(page, DOSSIER, "UC12-11-02-tableau", tableau(page));
  });

  await test.step("3. Année 2025-2026 : 29,3 %, 4 sur 5, le total en pied de tableau", async () => {
    await choisirAnnee(page, "2025-2026");
    await expect(carte(page, "Taux de recouvrement")).toContainText("29,3 %");
    await expect(carte(page, "Étudiants en retard")).toContainText(/4\s+sur 5/);
    await verifierLigne(sousTotal(page, "Sage-femmes"), { effectif: 2, attendu: 1_800_000, encaisse: 950_000, reste: 850_000, taux: "52,8 %", enRetard: 1 });
    await verifierLigne(totalTableau(page), { effectif: 5, attendu: 4_920_000, encaisse: 1_440_000, reste: 3_480_000, taux: "29,3 %", enRetard: 4 });
    await capture(page, DOSSIER, "UC12-11-03-annee-2025", tableau(page));
    await capture(page, DOSSIER, "UC12-11-03-cartes-2025", page.getByRole("region", { name: "Indicateurs" }));
  });

  await test.step("4. Filière Sage-femmes : 52,8 %, et les derniers paiements en cartes (3 reçus)", async () => {
    await choisirFiliere(page, "Sage-femmes");
    await expect(carte(page, "Taux de recouvrement")).toContainText("52,8 %");
    await expect(derniers(page).locator("tbody tr")).toHaveCount(3);
    await derniers(page).scrollIntoViewIfNeeded();
    await capture(page, DOSSIER, "UC12-11-04-sage-femmes", derniers(page));
  });
});
