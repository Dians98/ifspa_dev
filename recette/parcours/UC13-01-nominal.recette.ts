import {
  bandeau,
  boutonEncaisser,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  grandEcran,
  impressions,
  logoAffiche,
  numeroDuTicket,
  ouvrirGuichetEnLigne,
  recharger,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC13-hors-ligne";
const E = ETUDIANTS.voahirana;

test("UC13-01 : coupure, deux échéances en espèces, ticket, retour du réseau", async ({ page, poste }) => {
  test.setTimeout(120_000);

  await test.step("1. Ouvrir Encaisser avec Internet", async () => {
    await ouvrirGuichetEnLigne(page);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC13-01-01-en-ligne");
  });

  await test.step("2. Internet est coupé", async () => {
    await poste.setOffline(true);
    await expect(bandeau(page)).toContainText("Hors ligne · vous pouvez continuer à encaisser");
    await capture(page, DOSSIER, "UC13-01-02-coupure");
  });

  await test.step("3. Recharger la page sans Internet : elle s'ouvre quand même", async () => {
    await recharger(page, "Hors ligne · vous pouvez continuer à encaisser");
    await expect(bandeau(page)).toContainText(/liste du \d{2}\/\d{2} à \d{2}:\d{2}/);
    await expect(page.getByRole("button", { name: /^Étudiants Connexion nécessaire$/ })).toBeDisabled();
    await expect(page.getByRole("link", { name: /Encaisser/ }).first()).toBeVisible();
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC13-01-03-page-rechargee");
  });

  await test.step("4. Chercher l'étudiante dans la liste du poste", async () => {
    const recherche = page.getByRole("combobox", { name: /Rechercher l'étudiant/ });
    await recherche.fill(E.nom);
    await expect(page.getByRole("option", { name: new RegExp(`${E.nom} ${E.prenoms}`) })).toBeVisible();
    await expect(page.getByText("1 étudiant trouvé")).toBeVisible();
    await capture(page, DOSSIER, "UC13-01-04-recherche");
    await recherche.press("Enter");
    await expect(page.getByText(/Reste à payer :\s*900\s000\sAr/)).toBeVisible();
  });

  await test.step("5. Garder les deux premières échéances : droits d'inscription et octobre 2025", async () => {
    await expect(page.getByRole("button", { name: /^Novembre 2025,/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Novembre 2025,/ }).click();
    await expect(page.getByLabel("Montant reçu")).toHaveValue(/^180\s000$/);
    await expect(page.getByText("Hors ligne : le ticket porte son numéro définitif")).toBeVisible();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC13-01-05-echeances");
    await grandEcran(page, 900);
  });

  let numero = "";
  await test.step("6. Encaisser 180 000 Ar : le ticket est remis avec son numéro définitif", async () => {
    await boutonEncaisser(page, 180_000).click();
    numero = await numeroDuTicket(page);
    expect(numero).toBe("R-2026-00001");
    await expect(page.getByRole("status").filter({ hasText: "Paiement gardé sur ce poste" })).toBeVisible();
    await expect.poll(() => impressions(page)).toBe(1);
    await expect(bandeau(page)).toContainText("1 paiement en attente");
    await capture(page, DOSSIER, "UC13-01-06-ticket-remis");
  });

  await test.step("7. Le ticket imprimé", async () => {
    const ticket = await ticketImprime(page, numero);
    await expect(ticket).toContainText(`N° ${numero}`);
    await expect(ticket).toContainText("cent quatre-vingt mille ariary");
    await expect(ticket).toContainText(/Reste à payer\s*720\s000\sAr/);
    await capture(page, DOSSIER, "UC13-01-07-ticket-imprime", ticket);
    // Le contrôle strict du logo est fait à part, sur un poste neuf (UC13-09).
    if (!(await logoAffiche(ticket))) {
      test.info().annotations.push({ type: "anomalie", description: "Ticket hors ligne : logo absent (image cassée)." });
    }
    await finImpression(page);
  });

  await test.step("8. Le reste dû de l'étudiante a déjà baissé sur le poste", async () => {
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*720\s000\sAr/)).toBeVisible();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC13-01-08-reste-baisse");
    await grandEcran(page, 900);
  });

  await test.step("9. Internet revient : tout part au serveur", async () => {
    await poste.setOffline(false);
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
    await capture(page, DOSSIER, "UC13-01-09-synchronise", bandeau(page));
  });

  await test.step("10. Contrôler le reçu dans Paiements", async () => {
    await page.goto("/app/paiements");
    const ligne = page.getByRole("row").filter({ hasText: numero });
    await expect(ligne).toContainText(/180\s000\sAr/);
    await expect(ligne).toContainText("Valide");
    await expect(ligne).not.toContainText("À vérifier");
    await expect(ligne).toContainText(`${E.nom} ${E.prenoms}`);
    await capture(page, DOSSIER, "UC13-01-10-paiements");
    await ligne.getByRole("link", { name: /Réimprimer/ }).click();
    const ticket = page.getByRole("article", { name: new RegExp(`^Reçu ${numero}`) });
    await expect(ticket).toContainText(`N° ${numero}`);
    await expect(ticket).toContainText(/Reste à payer\s*720\s000\sAr/);
    await capture(page, DOSSIER, "UC13-01-11-recu-serveur");
  });
});
