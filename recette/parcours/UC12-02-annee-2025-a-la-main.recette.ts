import { ETUDIANTS } from "./aides";
import { aujourdhui, dontEnRetard, ouvrirFicheDe, resteAPayer } from "./aides-sorties";
import { carte, choisirAnnee, DOSSIER_UC12 as DOSSIER, ligneClasse, montantRegex, ouvrirDashboard, situation, sousTotal, tableau, totalTableau, verifierLigne } from "./aides-dashboard";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1500 } });

// Montants payés par étudiant de 2025-2026 (sections G et I) : de quoi refaire le total à la main.
const PAYE = [
  { e: ETUDIANTS.voahirana, paye: 260_000, reste: 640_000 },
  { e: ETUDIANTS.fanja, paye: 130_000, reste: 770_000 },
  { e: ETUDIANTS.tiana, paye: 100_000, reste: 800_000 },
  { e: ETUDIANTS.solofo, paye: 100_000, reste: 800_000 },
  { e: ETUDIANTS.mialy, paye: 900_000, reste: 0 },
  { e: ETUDIANTS.lalaina, paye: 50_000, reste: 850_000 },
] as const;

test("UC12-02 : l'année 2025-2026, des chiffres qu'on peut refaire à la main", async ({ page }) => {
  test.setTimeout(180_000);

  await test.step("1. Choisir l'année 2025-2026 : six étudiants, 28,5 %, 5 en retard", async () => {
    await ouvrirDashboard(page);
    await choisirAnnee(page, "2025-2026");
    await expect(situation(page)).toHaveText(`Situation au ${aujourdhui().fr} · année scolaire 2025-2026`);
    await expect(page.getByRole("combobox", { name: "Année scolaire" })).toContainText("2025-2026");
    await expect(carte(page, "Effectif actif")).toContainText("6");
    await expect(carte(page, "Effectif actif")).toContainText("4 Infirmier(e)s · 2 Sage-femmes");
    const taux = carte(page, "Taux de recouvrement");
    await expect(taux).toContainText("28,5 %");
    await expect(taux).toContainText(new RegExp(`${montantRegex(1_540_000).source} encaissés sur ${montantRegex(5_400_000).source} attendus à date`));
    await expect(taux).toContainText("Sous 85 %");
    const retard = carte(page, "Étudiants en retard");
    await expect(retard).toContainText(/5\s+sur 6/);
    await expect(retard).toContainText("Au moins une échéance échue impayée");
    await expect(retard.getByRole("link", { name: "Voir la liste des impayés" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC12-02-01-cartes");
  });

  await test.step("2. Le tableau : Infirmier(e)s 16,4 %, Sage-femmes 52,8 %, total 28,5 %", async () => {
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "1re année"), { effectif: 4, attendu: 3_600_000, encaisse: 590_000, reste: 3_010_000, taux: "16,4 %", enRetard: 4 });
    await verifierLigne(sousTotal(page, "Infirmier(e)s"), { effectif: 4, attendu: 3_600_000, encaisse: 590_000, reste: 3_010_000, taux: "16,4 %", enRetard: 4 });
    await verifierLigne(ligneClasse(page, "Sage-femmes", "1re année"), { effectif: 2, attendu: 1_800_000, encaisse: 950_000, reste: 850_000, taux: "52,8 %", enRetard: 1 });
    await verifierLigne(sousTotal(page, "Sage-femmes"), { effectif: 2, attendu: 1_800_000, encaisse: 950_000, reste: 850_000, taux: "52,8 %", enRetard: 1 });
    await verifierLigne(totalTableau(page), { effectif: 6, attendu: 5_400_000, encaisse: 1_540_000, reste: 3_860_000, taux: "28,5 %", enRetard: 5 });
    await capture(page, DOSSIER, "UC12-02-02-tableau", tableau(page));
  });

  await test.step("3. Contrôle à la main : la somme des fiches des six étudiants redonne 1 540 000 Ar payés et 3 860 000 Ar de reste", async () => {
    let somme = 0;
    let restes = 0;
    for (const { e, paye, reste } of PAYE) {
      await ouvrirFicheDe(page, e.nom, e.matricule);
      await expect(page.getByText(new RegExp(`Déjà payé\s*${montantRegex(paye).source}`))).toBeVisible();
      if (reste > 0) {
        await expect(resteAPayer(page)).toHaveText(montantRegex(reste));
        await expect(dontEnRetard(page)).toContainText(montantRegex(reste));
      } else {
        await expect(page.getByText("Rien à payer").first()).toBeVisible();
      }
      somme += paye;
      restes += reste;
      if (e === ETUDIANTS.voahirana) await capture(page, DOSSIER, "UC12-02-03-fiche-voahirana");
      if (e === ETUDIANTS.mialy) await capture(page, DOSSIER, "UC12-02-03-fiche-mialy");
    }
    expect(somme).toBe(1_540_000);
    expect(restes).toBe(3_860_000);
  });

  await test.step("4. L'année choisie est dans l'adresse : un rechargement retrouve le même tableau", async () => {
    await ouvrirDashboard(page);
    await choisirAnnee(page, "2025-2026");
    await page.reload();
    await expect(situation(page)).toContainText("année scolaire 2025-2026");
    await expect(totalTableau(page).locator('[data-label="Taux de recouvrement"]')).toContainText("28,5 %");
    await capture(page, DOSSIER, "UC12-02-04-rechargement");
  });
});
