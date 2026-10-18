import { bandeau, boutonEncaisser, montantRegex, montantRecu, recuEnregistre, testPoste as test } from "./aides";
import { choisirFiltreImpayes, DOSSIER_UC08 as DOSSIER, ligneEtudiant, lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { capture, expect } from "./outils";

// Après UC08-05 (TIANA a tout payé) ; même poste (navigateur) que 00e.
test("UC08-06 : un parent paie une partie, la ligne baisse mais l'étudiant reste à relancer", async ({ page }) => {
  test.setTimeout(90_000);

  await test.step("1. Dans Impayés, cliquer « Encaisser » sur la ligne de RANDRIAMAHEFA Solofo (900 000 Ar, 10 mois)", async () => {
    await page.setViewportSize({ width: 1440, height: 1500 });
    await ouvrirImpayes(page);
    await verifierSynthese(page, 5, 4_190_000);
    const solofo = ligneEtudiant(page, "RANDRIAMAHEFA Solofo");
    await expect(solofo).toContainText("10 mois");
    await expect(solofo).toContainText("Aucun");
    await solofo.getByRole("link", { name: /^Encaisser/ }).click();
    await page.waitForURL(/\/app\/encaisser\?etudiant=/);
    await expect(montantRecu(page)).toHaveValue(/^900\s000$/);
  });

  await test.step("2. Saisir 500 000 Ar dans « Montant reçu » et encaisser", async () => {
    await montantRecu(page).fill("500000");
    await expect(boutonEncaisser(page, 500_000)).toBeVisible();
    await capture(page, DOSSIER, "UC08-06-01-montant-saisi");
    await boutonEncaisser(page, 500_000).click();
    const recu = await recuEnregistre(page);
    console.log(`NUMERO-06 ${recu.numero}`);
    await expect(page.getByText(/Reste à payer :/)).toBeVisible();
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await capture(page, DOSSIER, "UC08-06-02-paiement-enregistre");
  });

  await test.step("3. Retour dans Impayés : SOLOFO reste, avec 5 mois et 400 000 Ar, dernier paiement 500 000 Ar", async () => {
    await page.getByRole("link", { name: "Impayés", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants en retard de paiement" })).toBeVisible();
    await verifierSynthese(page, 5, 3_690_000);
    await expect(lignesImpayes(page)).toHaveCount(5);
    const solofo = ligneEtudiant(page, "RANDRIAMAHEFA Solofo");
    await expect(solofo).toContainText("5 mois");
    await expect(solofo).toContainText(montantRegex(400_000));
    await expect(solofo).toContainText("17/10/2026");
    await expect(solofo).toContainText(montantRegex(500_000));
    await capture(page, DOSSIER, "UC08-06-03-liste-apres-paiement");
  });

  await test.step("4. Le filtre « 6 mois et plus » écarte maintenant SOLOFO (5 mois)", async () => {
    await choisirFiltreImpayes(page, "Mois de retard", "6 mois et plus");
    await expect(page).toHaveURL(/[?&]moisMin=6/);
    await verifierSynthese(page, 4, 3_290_000);
    await expect(ligneEtudiant(page, "RANDRIAMAHEFA Solofo")).toHaveCount(0);
    await capture(page, DOSSIER, "UC08-06-04-six-mois-et-plus");
  });

  await test.step("5. « 4 mois et plus » le garde", async () => {
    await choisirFiltreImpayes(page, "Mois de retard", "4 mois et plus");
    await expect(page).toHaveURL(/[?&]moisMin=4/);
    await verifierSynthese(page, 5, 3_690_000);
    await expect(ligneEtudiant(page, "RANDRIAMAHEFA Solofo")).toBeVisible();
    await capture(page, DOSSIER, "UC08-06-05-quatre-mois-et-plus");
  });
});
