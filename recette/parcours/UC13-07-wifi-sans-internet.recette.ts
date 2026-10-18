import {
  bandeau,
  boutonEncaisser,
  choisirEtudiant,
  ETUDIANTS,
  grandEcran,
  numeroDuTicket,
  ouvrirGuichetEnLigne,
  testPoste as test,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC13-hors-ligne";
const E = ETUDIANTS.nirina;
const E2 = ETUDIANTS.fanja;
const ADRESSES = "**/api/encaissement/**";

// Le navigateur reste « en ligne » (Wi-Fi allumé) alors qu'Internet est coupé en amont : aucun événement de coupure ni de retour.
test("UC13-07 : Wi-Fi allumé mais Internet coupé en amont, reprise automatique en 30 s ou au bouton", async ({ page }) => {
  test.setTimeout(240_000);
  const synchroniser = page.getByRole("button", { name: "Synchroniser" });

  await test.step("1. Ouvrir Encaisser avec Internet", async () => {
    await ouvrirGuichetEnLigne(page);
    await capture(page, DOSSIER, "UC13-07-01-en-ligne");
  });

  await test.step("2. Internet est coupé en amont : un envoi échoue, l'écran passe hors ligne", async () => {
    await page.route(ADRESSES, (route) => route.abort());
    await synchroniser.click();
    await expect(bandeau(page)).toContainText("Hors ligne · vous pouvez continuer à encaisser", { timeout: 20_000 });
    await expect(synchroniser).toBeEnabled();
    await capture(page, DOSSIER, "UC13-07-02-hors-ligne-sans-coupure-wifi");
  });

  let premier = "";
  await test.step("3. Droits d'un étudiant à jour : rien n'est coché d'office", async () => {
    await choisirEtudiant(page, E);
    await expect(page.getByLabel("Montant reçu")).toHaveValue("");
    await expect(page.getByText("Cochez une échéance ou saisissez le montant reçu.")).toBeVisible();
    await page.getByRole("button", { name: /^Droits d'inscription,/ }).click();
    await expect(page.getByLabel("Montant reçu")).toHaveValue(/^100\s000$/);
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC13-07-03-droits-a-venir");
    await grandEcran(page, 900);
  });

  await test.step("4. Encaisser 100 000 Ar", async () => {
    await boutonEncaisser(page, 100_000).click();
    premier = await numeroDuTicket(page);
    expect(premier).toBe("R-2026-00008");
    await expect(bandeau(page)).toContainText("1 paiement en attente");
    await capture(page, DOSSIER, "UC13-07-04-ticket-remis");
  });

  const retour = Date.now();
  await test.step("5. Internet revient sans que le Wi-Fi ait bougé : l'écran ne le sait pas encore, mais « Synchroniser » reste actif", async () => {
    await page.unroute(ADRESSES);
    await expect(bandeau(page)).toContainText("Hors ligne · vous pouvez continuer à encaisser");
    await expect(synchroniser).toBeEnabled();
    await capture(page, DOSSIER, "UC13-07-05-retour-sans-evenement");
  });

  await test.step("6. En 30 secondes au plus, l'écran retente tout seul et envoie le paiement", async () => {
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 45_000 });
    await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
    console.log(`UC13-07 : synchronisation automatique ${Math.round((Date.now() - retour) / 1000)} s après le retour d'Internet.`);
    await capture(page, DOSSIER, "UC13-07-06-synchronise-auto", bandeau(page));
  });

  let second = "";
  await test.step("7. Seconde panne : un autre paiement est encaissé hors ligne", async () => {
    await page.route(ADRESSES, (route) => route.abort());
    await synchroniser.click();
    await expect(bandeau(page)).toContainText("Hors ligne · vous pouvez continuer à encaisser", { timeout: 20_000 });
    await choisirEtudiant(page, E2);
    await expect(page.getByText(/Reste à payer :\s*640\s000\sAr/)).toBeVisible();
    await page.getByRole("button", { name: /^Janvier 2026,/ }).click();
    await expect(page.getByLabel("Montant reçu")).toHaveValue(/^80\s000$/);
    await boutonEncaisser(page, 80_000).click();
    second = await numeroDuTicket(page);
    expect(second).toBe("R-2026-00009");
    await expect(bandeau(page)).toContainText("1 paiement en attente");
    await capture(page, DOSSIER, "UC13-07-07-second-ticket");
  });

  await test.step("8. Internet revient : un clic sur « Synchroniser » envoie tout de suite", async () => {
    await page.unroute(ADRESSES);
    await synchroniser.click();
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
    await capture(page, DOSSIER, "UC13-07-08-synchronise-bouton", bandeau(page));
  });

  await test.step("9. Paiements : les deux reçus sont enregistrés", async () => {
    await page.goto("/app/paiements");
    const ligne1 = page.getByRole("row").filter({ hasText: premier });
    const ligne2 = page.getByRole("row").filter({ hasText: second });
    await expect(ligne1).toContainText(/100\s000\sAr/);
    await expect(ligne1).toContainText("Valide");
    await expect(ligne2).toContainText(/80\s000\sAr/);
    await expect(ligne2).toContainText("Valide");
    await capture(page, DOSSIER, "UC13-07-09-paiements");
  });
});
