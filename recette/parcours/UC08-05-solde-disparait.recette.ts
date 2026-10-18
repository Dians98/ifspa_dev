import { bandeau, boutonEncaisser, montantRegex, montantRecu, recuEnregistre, testPoste as test } from "./aides";
import { DOSSIER_UC08 as DOSSIER, ligneEtudiant, lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { capture, expect } from "./outils";

// Après 00-preparation (A, B, C), 00e-preparation (G) et UC08-02 à UC08-04 ; même poste (navigateur) que 00e.
test("UC08-05 : un parent solde tout l'impayé depuis la liste, l'étudiant sort de la liste", async ({ page }) => {
  test.setTimeout(90_000);
  let numero = "";

  await test.step("1. Dans Impayés, cliquer « Encaisser » sur la ligne de ANDRIANARISOA Tiana", async () => {
    await page.setViewportSize({ width: 1440, height: 1500 });
    await ouvrirImpayes(page);
    await verifierSynthese(page, 6, 5_090_000);
    await ligneEtudiant(page, "ANDRIANARISOA Tiana").getByRole("link", { name: /^Encaisser/ }).click();
    await page.waitForURL(/\/app\/encaisser\?etudiant=/);
    await expect(page.getByRole("heading", { level: 1, name: "Encaisser" })).toBeVisible();
    await expect(page.getByText(/Reste à payer :/)).toBeVisible();
    await expect(page.getByText("ANDRIANARISOA Tiana").first()).toBeVisible();
    await expect(montantRecu(page)).toHaveValue(/^900\s000$/);
    await capture(page, DOSSIER, "UC08-05-01-guichet-depuis-la-liste");
  });

  await test.step("2. Encaisser 900 000 Ar : tout l'impayé est soldé", async () => {
    await boutonEncaisser(page, 900_000).click();
    const recu = await recuEnregistre(page);
    numero = recu.numero;
    console.log(`NUMERO-05 ${numero}`);
    await expect(page.getByText(/Reste à payer :/)).toBeVisible();
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await capture(page, DOSSIER, "UC08-05-02-paiement-enregistre");
  });

  await test.step("3. Retour dans Impayés : TIANA a disparu, cinq étudiants, 4 190 000 Ar à recouvrer", async () => {
    await page.getByRole("link", { name: "Impayés", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants en retard de paiement" })).toBeVisible();
    await verifierSynthese(page, 5, 4_190_000);
    await expect(lignesImpayes(page)).toHaveCount(5);
    await expect(ligneEtudiant(page, "ANDRIANARISOA Tiana")).toHaveCount(0);
    await capture(page, DOSSIER, "UC08-05-03-liste-apres-solde");
  });

  await test.step("4. Sa fiche : plus rien à payer, aucun retard", async () => {
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /ANDRIANARISOA Tiana/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ANDRIANARISOA");
    await expect(page.getByText("Aucun retard")).toBeVisible();
    await expect(page.getByText(montantRegex(900_000)).first()).toBeVisible();
    await capture(page, DOSSIER, "UC08-05-04-fiche-soldee");
  });
});
