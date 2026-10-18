import {
  bandeau,
  boutonEncaisser,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  grandEcran,
  logoAffiche,
  numeroDuTicket,
  ouvrirGuichetEnLigne,
  recharger,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC13-hors-ligne";
const E = ETUDIANTS.nirina;

// Le logo s'affiche ici parce que le poste l'a déjà chargé au cas 07 (réseau présent sous le blocage) ; le contrôle strict est UC13-09.
test("UC13-08 : sans Internet, octobre d'un étudiant à jour, le ticket porte le logo", async ({ page, poste }) => {
  test.setTimeout(150_000);

  await test.step("1. Coupure, puis ouvrir l'étudiant : il a déjà payé ses droits, octobre est à venir", async () => {
    await ouvrirGuichetEnLigne(page);
    await poste.setOffline(true);
    await recharger(page, "Hors ligne · vous pouvez continuer à encaisser");
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*800\s000\sAr/)).toBeVisible();
    await expect(page.getByLabel("Montant reçu")).toHaveValue("");
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC13-08-01-octobre-a-venir");
    await grandEcran(page, 900);
  });

  let numero = "";
  await test.step("2. Cocher octobre 2026 et encaisser 80 000 Ar", async () => {
    await page.getByRole("button", { name: /^Octobre 2026,/ }).click();
    await expect(page.getByLabel("Montant reçu")).toHaveValue(/^80\s000$/);
    await boutonEncaisser(page, 80_000).click();
    numero = await numeroDuTicket(page);
    expect(numero).toBe("R-2026-00010");
    await expect(bandeau(page)).toContainText("1 paiement en attente");
  });

  await test.step("3. Le ticket imprimé : en-tête, logo, reste à jour", async () => {
    const ticket = await ticketImprime(page, numero);
    await expect(ticket).toContainText("quatre-vingt mille ariary");
    await expect(ticket).toContainText("Néant, à jour");
    await expect(ticket).toContainText(/Reste à payer\s*720\s000\sAr/);
    await capture(page, DOSSIER, "UC13-08-03-ticket-imprime", ticket);
    expect(await logoAffiche(ticket), "Le logo du ticket doit s'afficher même sans Internet.").toBe(true);
    await finImpression(page);
  });

  await test.step("4. Internet revient : le paiement part", async () => {
    await poste.setOffline(false);
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
  });
});
