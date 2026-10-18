import { ETUDIANTS } from "./aides";
import { carte, choisirAnnee, choisirFiliere, derniers, DOSSIER_UC12 as DOSSIER, lignesDerniers, ligneClasse, numerosDerniers, ouvrirDashboard, RECUS, totalTableau, verifierLigne } from "./aides-dashboard";
import { lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { ligne, ouvrirPaiements, total, verifierTotal } from "./aides-paiements";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1500 } });

const NUMERO = RECUS.solofo;
const MOTIF = "Reçu établi au nom d'un autre étudiant";
const { solofo } = ETUDIANTS;

test("UC12-05 : un reçu annulé sort des chiffres du tableau de bord, mais reste dans les derniers paiements", async ({ page }) => {
  test.setTimeout(150_000);

  await test.step("1. Avant : 2025-2026 à 28,5 %, 1 540 000 Ar encaissés, Infirmier(e)s 590 000 Ar", async () => {
    await ouvrirDashboard(page);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await choisirAnnee(page, "2025-2026");
    await expect(carte(page, "Taux de recouvrement")).toContainText("28,5 %");
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "1re année"), { effectif: 4, attendu: 3_600_000, encaisse: 590_000, reste: 3_010_000, taux: "16,4 %", enRetard: 4 });
    await capture(page, DOSSIER, "UC12-05-01-avant");
  });

  await test.step("2. Paiements : annuler le reçu R-2026-00027 (RANDRIAMAHEFA Solofo, 100 000 Ar) avec un motif", async () => {
    await ouvrirPaiements(page);
    await verifierTotal(page, "Total encaissé", 1_954_000);
    await ligne(page, NUMERO).getByRole("button", { name: `Annuler le reçu ${NUMERO}` }).click();
    const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${NUMERO}` });
    await expect(dialogue).toContainText(`${solofo.nom} ${solofo.prenoms} ${solofo.matricule}`);
    await dialogue.getByLabel("Motif de l'annulation").fill(MOTIF);
    await capture(page, DOSSIER, "UC12-05-02-fenetre", dialogue);
    await dialogue.getByRole("button", { name: `Annuler le reçu ${NUMERO}` }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText(`Reçu ${NUMERO} annulé : les échéances qu'il payait sont de nouveau dues.`)).toBeVisible();
  });

  await test.step("3. Tableau de bord 2025-2026 : 1 440 000 Ar encaissés, 26,7 %, reste 3 960 000 Ar", async () => {
    await ouvrirDashboard(page);
    await choisirAnnee(page, "2025-2026");
    const taux = carte(page, "Taux de recouvrement");
    await expect(taux).toContainText("26,7 %");
    await expect(taux).toContainText(/1\s440\s000\sAr encaissés sur 5\s400\s000\sAr attendus à date/);
    await expect(carte(page, "Étudiants en retard")).toContainText(/5\s+sur 6/);
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "1re année"), { effectif: 4, attendu: 3_600_000, encaisse: 490_000, reste: 3_110_000, taux: "13,6 %", enRetard: 4 });
    await verifierLigne(totalTableau(page), { effectif: 6, attendu: 5_400_000, encaisse: 1_440_000, reste: 3_960_000, taux: "26,7 %", enRetard: 5 });
    await capture(page, DOSSIER, "UC12-05-03-apres");
  });

  await test.step("4. Derniers paiements : le reçu annulé reste à sa place, marqué « Annulé », les dix lignes sont les mêmes", async () => {
    await expect(lignesDerniers(page)).toHaveCount(10);
    expect(await numerosDerniers(page)).toContain(NUMERO);
    const l = lignesDerniers(page).filter({ hasText: NUMERO });
    await expect(l).toContainText("Annulé");
    await expect(l).not.toContainText("Valide");
    await expect(lignesDerniers(page).filter({ hasText: "Annulé" })).toHaveCount(1);
    await capture(page, DOSSIER, "UC12-05-04-derniers-annule", derniers(page));
  });

  await test.step("5. Paiements : le reçu annulé est compté à part, le total tombe à 1 854 000 Ar", async () => {
    await ouvrirPaiements(page);
    await expect(total(page, "Reçus")).toContainText("11");
    await expect(total(page, "Reçus")).toContainText("+ 1 annulé");
    await verifierTotal(page, "Total encaissé", 1_854_000);
    await expect(ligne(page, NUMERO)).toContainText("Annulé");
    await capture(page, DOSSIER, "UC12-05-05-paiements");
  });

  await test.step("6. Impayés : l'étudiant redoit 900 000 Ar, la liste totalise 3 960 000 Ar comme le tableau de bord", async () => {
    await ouvrirImpayes(page);
    await verifierSynthese(page, 5, 3_960_000);
    await expect(lignesImpayes(page).filter({ hasText: "RANDRIAMAHEFA Solofo" })).toContainText(/900\s000\sAr/);
    await capture(page, DOSSIER, "UC12-05-06-impayes");
  });

  await test.step("7. Filière Infirmier(e)s au tableau de bord : 490 000 Ar encaissés sur 3 600 000 Ar", async () => {
    await ouvrirDashboard(page);
    await choisirAnnee(page, "2025-2026");
    await choisirFiliere(page, "Infirmier(e)s");
    await expect(carte(page, "Taux de recouvrement")).toContainText("13,6 %");
    await expect(carte(page, "Taux de recouvrement")).toContainText(/490\s000\sAr encaissés sur 3\s600\s000\sAr/);
  });
});
