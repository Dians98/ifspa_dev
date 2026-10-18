import { barreResume, caseEtudiant, choisirClasse, decocher, ETUDIANTS_IF as IF, ligneEtudiant, ouvrirAdmissions } from "./aides-admissions";
import { carte, choisirAnnee, DOSSIER_UC12 as DOSSIER, ligneClasse, ouvrirDashboard, sousTotal, tableau, totalTableau, verifierLigne } from "./aides-dashboard";
import { lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1500 } });

const NUL = { attendu: 0, encaisse: 0, reste: 0, taux: null, enRetard: 0 } as const;

test("UC12-07 : après le passage de la classe IF 1re année, 2026-2027 compte une ligne par niveau", async ({ page }) => {
  test.setTimeout(150_000);

  await test.step("1. Passage en année supérieure : Tiana (sortie) n'est plus proposée, Solofo est décoché (il redouble), Voahirana et Fanja passent", async () => {
    await ouvrirAdmissions(page);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await choisirClasse(page, "Infirmier(e)s", "1re année");
    await expect(page.getByText("3 étudiants · passage en 2e année pour 2026-2027")).toBeVisible();
    await expect(page.getByTestId("ligne-etudiant")).toHaveCount(3);
    await expect(page.getByTestId("ligne-etudiant").filter({ hasText: "ANDRIANARISOA Tiana" })).toHaveCount(0);
    await decocher(page, IF.solofo);
    await expect(caseEtudiant(page, IF.voahirana)).toBeChecked();
    await expect(caseEtudiant(page, IF.fanja)).toBeChecked();
    await expect(ligneEtudiant(page, IF.solofo).getByRole("radio", { name: "Redouble" })).toBeChecked();
    await expect(barreResume(page)).toHaveText(/2 passent en 2e année\s*·\s*1 redouble/);
    await capture(page, DOSSIER, "UC12-07-01-classe");
  });

  await test.step("2. Valider : une seule confirmation, le passage est enregistré", async () => {
    await page.getByRole("button", { name: "Valider les Infirmier(e)s 1re année" }).click();
    const dialogue = page.getByRole("dialog", { name: /Valider le passage/ });
    await expect(dialogue).toBeVisible();
    await dialogue.getByRole("button", { name: /^Valider le passage de \d+ étudiants?$/ }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText(/validée : 2 passent en 2e année/)).toBeVisible();
    await capture(page, DOSSIER, "UC12-07-02-valide");
  });

  await test.step("3. Tableau de bord 2026-2027 : IF 1re année 4 (Nirina, Hery, Faly, Solofo qui redouble), IF 2e année 2, SF 1re année 1, soit 7", async () => {
    await ouvrirDashboard(page);
    await expect(carte(page, "Effectif actif")).toContainText("7");
    await expect(carte(page, "Effectif actif")).toContainText("6 Infirmier(e)s · 1 Sage-femmes");
    await expect(carte(page, "Taux de recouvrement")).toContainText("—");
    await expect(carte(page, "Étudiants en retard")).toContainText(/0\s+sur 7/);
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "1re année"), { effectif: 4, ...NUL });
    await verifierLigne(ligneClasse(page, "Infirmier(e)s", "2e année"), { effectif: 2, ...NUL });
    await verifierLigne(sousTotal(page, "Infirmier(e)s"), { effectif: 6, ...NUL });
    await verifierLigne(ligneClasse(page, "Sage-femmes", "1re année"), { effectif: 1, ...NUL });
    await verifierLigne(totalTableau(page), { effectif: 7, ...NUL });
    await capture(page, DOSSIER, "UC12-07-03-dashboard-2026");
  });

  await test.step("4. Tableau de bord 2025-2026 : inchangé, rien n'est reporté sur la nouvelle année (29,3 %, 4 sur 5)", async () => {
    await choisirAnnee(page, "2025-2026");
    await expect(carte(page, "Effectif actif")).toContainText("5");
    await expect(carte(page, "Taux de recouvrement")).toContainText("29,3 %");
    await expect(carte(page, "Étudiants en retard")).toContainText(/4\s+sur 5/);
    await verifierLigne(totalTableau(page), { effectif: 5, attendu: 4_920_000, encaisse: 1_440_000, reste: 3_480_000, taux: "29,3 %", enRetard: 4 });
    await expect(tableau(page)).not.toContainText("2e année");
    await capture(page, DOSSIER, "UC12-07-04-dashboard-2025");
  });

  await test.step("5. Impayés : toujours 4 étudiants et 3 160 000 Ar (les retards de 2025-2026), alors que le tableau de bord 2026-2027 affiche « 0 sur 7 »", async () => {
    await ouvrirImpayes(page);
    await verifierSynthese(page, 4, 3_160_000);
    await expect(lignesImpayes(page)).toHaveCount(4);
    await capture(page, DOSSIER, "UC12-07-05-impayes");
  });
});
