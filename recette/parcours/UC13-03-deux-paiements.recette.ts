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
const E = ETUDIANTS.tiana;

test("UC13-03 : deux paiements du même étudiant sans Internet, le second part des restes diminués", async ({ page, poste }) => {
  test.setTimeout(150_000);

  await test.step("1. Ouvrir Encaisser avec Internet, puis couper Internet et recharger", async () => {
    await ouvrirGuichetEnLigne(page);
    await poste.setOffline(true);
    await recharger(page, "Hors ligne · vous pouvez continuer à encaisser");
  });

  let premier = "";
  await test.step("2. Premier paiement : droits d'inscription et octobre, 180 000 Ar", async () => {
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*900\s000\sAr/)).toBeVisible();
    await page.getByRole("button", { name: /^Novembre 2025,/ }).click();
    await boutonEncaisser(page, 180_000).click();
    premier = await numeroDuTicket(page);
    expect(premier).toBe("R-2026-00003");
    await expect(bandeau(page)).toContainText("1 paiement en attente");
    await capture(page, DOSSIER, "UC13-03-02-premier-ticket");
  });

  let second = "";
  await test.step("3. Le même étudiant revient : sa liste commence à novembre, le reste est 720 000 Ar", async () => {
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*720\s000\sAr/)).toBeVisible();
    await expect(page.getByText(/Déjà payé sur 2025-2026 :\s*180\s000\sAr sur 900\s000\sAr/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Droits d'inscription,/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Novembre 2025,/ })).toBeVisible();
    await page.getByRole("button", { name: /^Janvier 2026,/ }).click();
    await expect(page.getByLabel("Montant reçu")).toHaveValue(/^160\s000$/);
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC13-03-03-second-paiement");
    await grandEcran(page, 900);
  });

  await test.step("4. Second paiement : novembre et décembre, 160 000 Ar", async () => {
    await boutonEncaisser(page, 160_000).click();
    second = await numeroDuTicket(page);
    expect(second).toBe("R-2026-00004");
    await expect(bandeau(page)).toContainText("2 paiements en attente");
    await capture(page, DOSSIER, "UC13-03-04-second-ticket");
  });

  await test.step("5. Le second ticket montre le reste après les deux paiements : 560 000 Ar", async () => {
    const ticket = await ticketImprime(page, second);
    await expect(ticket).toContainText("Novembre 2025");
    await expect(ticket).toContainText("Décembre 2025");
    await expect(ticket).toContainText(/Reste à payer\s*560\s000\sAr/);
    await capture(page, DOSSIER, "UC13-03-05-second-ticket-imprime", ticket);
    await finImpression(page);
  });

  await test.step("6. Internet revient : les deux paiements partent, dans l'ordre", async () => {
    await poste.setOffline(false);
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(bandeau(page)).toContainText("2 paiements envoyés au serveur");
    await expect(bandeau(page)).not.toContainText("à vérifier");
    await capture(page, DOSSIER, "UC13-03-06-synchronise", bandeau(page));
  });

  await test.step("7. Paiements : les deux reçus, numéros conservés", async () => {
    await page.goto("/app/paiements");
    const lignePremier = page.getByRole("row").filter({ hasText: premier });
    const ligneSecond = page.getByRole("row").filter({ hasText: second });
    await expect(lignePremier).toContainText(/180\s000\sAr/);
    await expect(ligneSecond).toContainText(/160\s000\sAr/);
    await expect(lignePremier).toContainText("Valide");
    await expect(ligneSecond).toContainText("Valide");
    await capture(page, DOSSIER, "UC13-03-07-paiements");
  });

  await test.step("8. Le reçu du second paiement, relu au serveur, donne le même reste", async () => {
    await page.getByRole("row").filter({ hasText: second }).getByRole("link", { name: /Réimprimer/ }).click();
    const ticket = page.getByRole("article", { name: new RegExp(`^Reçu ${second}`) });
    await expect(ticket).toContainText(/Reste à payer\s*560\s000\sAr/);
    await capture(page, DOSSIER, "UC13-03-08-recu-serveur");
  });

  await test.step("9. La fiche de l'étudiant : 340 000 Ar payés, 560 000 Ar restent", async () => {
    await page.goto("/app/paiements");
    await page.getByRole("row").filter({ hasText: second }).getByRole("link", { name: `${E.nom} ${E.prenoms}` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(E.nom);
    await expect(page.getByText(/560\s000\sAr/).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "Paiements (2)" })).toBeVisible();
    await grandEcran(page, 1500);
    await capture(page, DOSSIER, "UC13-03-09-fiche");
  });
});
