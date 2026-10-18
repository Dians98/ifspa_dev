import { ETUDIANTS } from "./aides";
import { carte, choisirAnnee, DOSSIER_UC12 as DOSSIER, lignesDerniers, ligneClasse, numerosDerniers, ouvrirDashboard, RECUS, sousTotal, totalTableau, verifierLigne } from "./aides-dashboard";
import { lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { boutonSortie, dialogueSortie, dontEnRetard, ouvrirFicheDe, resteAPayer } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1500 } });

const { tiana } = ETUDIANTS;
const MOTIF = "Départ à l'étranger avec sa famille";

test("UC12-06 : un abandon du 31 janvier sort l'étudiant de l'effectif et des retards, mais son argent et son dû restent comptés", async ({ page }) => {
  test.setTimeout(150_000);

  await test.step("1. Administrateur : fiche de ANDRIANARISOA Tiana, 100 000 Ar payés, 800 000 Ar à payer", async () => {
    await ouvrirFicheDe(page, tiana.nom, tiana.matricule);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(/800\s000\sAr/);
    await expect(dontEnRetard(page)).toContainText(/800\s000\sAr/);
  });

  await test.step("2. « Enregistrer une sortie » : Abandon au 31/01/2026, 6 échéances ne sont plus dues, il reste 320 000 Ar à payer", async () => {
    await boutonSortie(page).click();
    const dialogue = dialogueSortie(page);
    await dialogue.getByLabel("Date de sortie").fill("2026-01-31");
    await dialogue.getByLabel("Motif").fill(MOTIF);
    await dialogue.getByRole("button", { name: "Enregistrer l'abandon" }).click();
    await expect(page.getByText("Abandon enregistré : 6 échéances des mois suivants ne sont plus dues.")).toBeVisible();
    await expect(dialogueSortie(page)).toBeHidden();
    await expect(page.getByText("Sorti · Abandon le 31/01/2026")).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(/320\s000\sAr/);
    await capture(page, DOSSIER, "UC12-06-02-fiche-sortie");
  });

  await test.step("3. Tableau de bord 2025-2026 : 5 actifs, attendu 4 920 000 Ar (480 000 Ar de moins), encaissé inchangé, 29,3 %, 4 en retard", async () => {
    await ouvrirDashboard(page);
    await choisirAnnee(page, "2025-2026");
    await expect(carte(page, "Effectif actif")).toContainText("3 Infirmier(e)s · 2 Sage-femmes");
    await expect(carte(page, "Effectif actif")).toContainText("5");
    const taux = carte(page, "Taux de recouvrement");
    await expect(taux).toContainText("29,3 %");
    await expect(taux).toContainText(/1\s440\s000\sAr encaissés sur 4\s920\s000\sAr attendus à date/);
    await expect(carte(page, "Étudiants en retard")).toContainText(/4\s+sur 5/);
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "1re année"), { effectif: 3, attendu: 3_120_000, encaisse: 490_000, reste: 2_630_000, taux: "15,7 %", enRetard: 3 });
    await verifierLigne(sousTotal(page, "Sage-femmes"), { effectif: 2, attendu: 1_800_000, encaisse: 950_000, reste: 850_000, taux: "52,8 %", enRetard: 1 });
    await verifierLigne(totalTableau(page), { effectif: 5, attendu: 4_920_000, encaisse: 1_440_000, reste: 3_480_000, taux: "29,3 %", enRetard: 4 });
    await capture(page, DOSSIER, "UC12-06-03-dashboard");
  });

  await test.step("4. Son reçu R-2026-00024 reste dans les derniers paiements, valide", async () => {
    expect(await numerosDerniers(page)).toContain(RECUS.tiana);
    await expect(lignesDerniers(page).filter({ hasText: RECUS.tiana })).toContainText("Valide");
    await expect(lignesDerniers(page).filter({ hasText: RECUS.tiana })).toContainText("ANDRIANARISOA Tiana");
  });

  await test.step("5. Impayés : 4 étudiants, 3 160 000 Ar ; l'écart de 320 000 Ar avec le reste du tableau de bord (3 480 000 Ar) est le dû de Tiana", async () => {
    await ouvrirImpayes(page);
    await verifierSynthese(page, 4, 3_160_000);
    await expect(lignesImpayes(page)).toHaveCount(4);
    await expect(page.getByRole("region", { name: "Liste des étudiants en retard" })).not.toContainText("ANDRIANARISOA Tiana");
    expect(3_480_000 - 3_160_000).toBe(320_000);
    await capture(page, DOSSIER, "UC12-06-05-impayes");
  });
});
