import {
  bandeau,
  boutonEncaisser,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  grandEcran,
  numeroDuTicket,
  ouvrirGuichetEnLigne,
  recharger,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC13-hors-ligne";
const E = ETUDIANTS.fanja;
const REFERENCE = "MP261017.1015.B21";

test("UC13-02 : Mobile Money MVola sans Internet, trois échéances", async ({ page, poste }) => {
  test.setTimeout(120_000);

  await test.step("1. Ouvrir Encaisser avec Internet, puis couper Internet et recharger", async () => {
    await ouvrirGuichetEnLigne(page);
    await poste.setOffline(true);
    await recharger(page, "Hors ligne · vous pouvez continuer à encaisser");
    await capture(page, DOSSIER, "UC13-02-01-hors-ligne");
  });

  await test.step("2. Chercher l'étudiante et cocher droits, octobre et novembre", async () => {
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*900\s000\sAr/)).toBeVisible();
    await page.getByRole("button", { name: /^Décembre 2025,/ }).click();
    await expect(page.getByLabel("Montant reçu")).toHaveValue(/^260\s000$/);
  });

  await test.step("3. Choisir Mobile Money : le bouton attend l'opérateur", async () => {
    await page.getByRole("radio", { name: "Mobile Money" }).check();
    await expect(page.getByText("Choisissez l'opérateur Mobile Money.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Encaisser 260\s000\sAr et imprimer le reçu$/ })).toBeDisabled();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC13-02-03-operateur-manquant");
    await grandEcran(page, 900);
  });

  await test.step("4. MVola et la référence du SMS : le bouton s'ouvre", async () => {
    await page.getByRole("radio", { name: "MVola" }).check();
    await expect(page.getByText("Saisissez la référence de la transaction Mobile Money.")).toBeVisible();
    await page.getByLabel("Référence de la transaction").fill(REFERENCE);
    await expect(boutonEncaisser(page, 260_000)).toBeEnabled();
    await expect(page.getByText(/Droits d'inscription → Novembre 2025 · 3 échéances soldées · Mobile Money MVola/)).toBeVisible();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC13-02-04-mvola-reference");
    await grandEcran(page, 900);
  });

  let numero = "";
  await test.step("5. Encaisser 260 000 Ar : ticket remis", async () => {
    await boutonEncaisser(page, 260_000).click();
    numero = await numeroDuTicket(page);
    expect(numero).toBe("R-2026-00002");
    await expect(page.getByRole("status").filter({ hasText: "Paiement gardé sur ce poste" })).toBeVisible();
    await expect(bandeau(page)).toContainText("1 paiement en attente");
    await capture(page, DOSSIER, "UC13-02-05-ticket-remis");
  });

  await test.step("6. Le ticket imprimé porte le mode et la référence", async () => {
    const ticket = await ticketImprime(page, numero);
    await expect(ticket).toContainText("Mobile Money · MVola");
    await expect(ticket).toContainText("Réf.");
    await expect(ticket).toContainText(REFERENCE);
    await expect(ticket).toContainText("deux cent soixante mille ariary");
    await expect(ticket).toContainText(/Reste à payer\s*640\s000\sAr/);
    await capture(page, DOSSIER, "UC13-02-06-ticket-imprime", ticket);
    await finImpression(page);
  });

  await test.step("7. Internet revient : le paiement part", async () => {
    await poste.setOffline(false);
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
    await capture(page, DOSSIER, "UC13-02-07-synchronise", bandeau(page));
  });

  await test.step("8. Contrôler dans Paiements : mode, opérateur et référence", async () => {
    await page.goto("/app/paiements");
    const ligne = page.getByRole("row").filter({ hasText: numero });
    await expect(ligne).toContainText(/260\s000\sAr/);
    await expect(ligne).toContainText("Mobile Money · MVola");
    await expect(ligne).toContainText(REFERENCE);
    await expect(ligne).toContainText("Valide");
    await capture(page, DOSSIER, "UC13-02-08-paiements");
  });
});
