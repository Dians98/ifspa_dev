import { boutonEncaisser, choisirEtudiant, finImpression, montantRecu, recuEnregistre } from "./aides";
import { A, B, D, DOSSIER, POSTE_GUICHET } from "./aides-az";
import { capture, expect, SESSIONS, test } from "./outils";

// Acte 3 : au guichet, le secrétariat encaisse A (espèces), B (Mobile Money), refuse un trop-perçu, encaisse D, puis se trompe.
test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1900 } });

test("Acte 3 : le guichet encaisse A, B et D", async ({ page }) => {
  test.setTimeout(150_000);
  const numeros: Record<string, string> = {};

  await test.step("3.1 Encaisser : chercher RAKOTOMALALA, tout l'impayé est coché", async () => {
    await page.goto("/app/encaisser");
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await choisirEtudiant(page, A);
    await expect(page.getByText(/Reste à payer :\s*900\s000\sAr, dont 900\s000\sAr en retard/)).toBeVisible();
    await expect(montantRecu(page)).toHaveValue(/^900\s000$/);
    await capture(page, DOSSIER, "AZ-3-1-a-tout-coche");
  });

  await test.step("3.2 Espèces : encaisser 900 000 Ar", async () => {
    await expect(page.getByRole("radio", { name: "Espèces" })).toBeChecked();
    await boutonEncaisser(page, 900_000).click();
    const r = await recuEnregistre(page);
    numeros.a = r.numero;
    await expect(r.zone).toContainText(/900\s000\sAr · Espèces · RAKOTOMALALA Voahirana\. Reste à payer : 0\sAr\./);
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, DOSSIER, "AZ-3-2-a-enregistre");
    await page.setViewportSize({ width: 1440, height: 1900 });
  });

  await test.step("3.3 Le ticket 80 mm et son double : montant en lettres, reste à payer 0", async () => {
    await page.emulateMedia({ media: "print" });
    const tickets = page.getByRole("article", { name: new RegExp(`^Reçu ${numeros.a}`) });
    await expect(tickets).toHaveCount(2);
    await expect(tickets.nth(0)).toContainText("neuf cent mille ariary");
    await expect(tickets.nth(0)).not.toContainText("DOUBLE");
    await expect(tickets.nth(1)).toContainText("DOUBLE");
    await capture(page, DOSSIER, "AZ-3-3-a-ticket", tickets.nth(0));
    await capture(page, DOSSIER, "AZ-3-3b-a-double", tickets.nth(1));
    await finImpression(page);
  });

  await test.step("3.4 B paie 300 000 Ar en Mobile Money (MVola, référence)", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, B);
    await montantRecu(page).fill("300000");
    await page.getByRole("radio", { name: "Mobile Money" }).check();
    await page.getByRole("radio", { name: "MVola" }).check();
    await page.getByLabel("Référence de la transaction").fill("MV261025.0912.B02");
    await expect(boutonEncaisser(page, 300_000)).toBeEnabled();
    await capture(page, DOSSIER, "AZ-3-4-b-mobile-money");
  });

  await test.step("3.5 Encaisser : les tranches sont soldées, un acompte part sur décembre", async () => {
    await boutonEncaisser(page, 300_000).click();
    const r = await recuEnregistre(page);
    numeros.b = r.numero;
    await expect(r.zone).toContainText(/300\s000\sAr · Mobile Money · RASOANAIVO Fanja\. Reste à payer : 600\s000\sAr\./);
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, DOSSIER, "AZ-3-5-b-enregistre");
    await page.setViewportSize({ width: 1440, height: 1900 });
  });

  await test.step("3.6 Refus : 1 000 000 Ar pour B, qui ne doit plus que 600 000 Ar", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, B);
    await montantRecu(page).fill("1000000");
    await expect(page.getByRole("alert").filter({ hasText: /dépasse ce que l'étudiant doit encore/ })).toContainText(
      /600\s000\sAr au plus/,
    );
    await expect(page.getByRole("button", { name: /^Encaisser( .*)? et imprimer le reçu$/ })).toBeDisabled();
    await capture(page, DOSSIER, "AZ-3-6-b-trop-percu");
  });

  await test.step("3.7 D paie 100 000 Ar en espèces", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, D);
    await montantRecu(page).fill("100000");
    await boutonEncaisser(page, 100_000).click();
    const r = await recuEnregistre(page);
    numeros.d = r.numero;
    await expect(r.zone).toContainText(/100\s000\sAr · Espèces · ANDRIANARISOA Tiana\. Reste à payer : 800\s000\sAr\./);
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, DOSSIER, "AZ-3-7-d-enregistre");
    await page.setViewportSize({ width: 1440, height: 1900 });
  });

  await test.step("3.8 Erreur de saisie : 60 000 Ar encaissés sur D, qui revenaient à un autre parent", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, D);
    await montantRecu(page).fill("60000");
    await boutonEncaisser(page, 60_000).click();
    const r = await recuEnregistre(page);
    numeros.erreur = r.numero;
    await expect(r.zone).toContainText(/60\s000\sAr · Espèces · ANDRIANARISOA Tiana\. Reste à payer : 740\s000\sAr\./);
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, DOSSIER, "AZ-3-8-erreur-enregistree");
    await page.setViewportSize({ width: 1440, height: 1900 });
  });

  await page.context().storageState({ path: POSTE_GUICHET, indexedDB: true });
});
