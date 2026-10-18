import {
  bandeau,
  boutonEncaisser,
  choisirEtudiant,
  ETUDIANTS,
  grandEcran,
  numeroDuTicket,
  ouvrirGuichetEnLigne,
  recharger,
  testPoste as test,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC13-hors-ligne";
const E = ETUDIANTS.solofo;
const ENCAISSER_SANS_MONTANT = /^Encaisser( .*)? et imprimer le reçu$/;

test("UC13-06 : sans Internet, un montant au-delà du reste dû ou nul est refusé", async ({ page, poste }) => {
  test.setTimeout(150_000);

  await test.step("1. Coupure, puis l'étudiant est ouvert : reste à payer 900 000 Ar", async () => {
    await ouvrirGuichetEnLigne(page);
    await poste.setOffline(true);
    await recharger(page, "Hors ligne · vous pouvez continuer à encaisser");
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*900\s000\sAr/)).toBeVisible();
  });

  await test.step("2. Saisir 1 000 000 Ar : refusé, le bouton reste fermé", async () => {
    const montant = page.getByLabel("Montant reçu");
    await montant.fill("1000000");
    await expect(montant).toHaveAttribute("aria-invalid", "true");
    const alerte = page.getByRole("alert").filter({ hasText: /dépasse ce que l'étudiant doit encore/ });
    await expect(alerte).toContainText(/900\s000\sAr au plus/);
    await expect(page.getByRole("button", { name: ENCAISSER_SANS_MONTANT })).toBeDisabled();
    await expect(page.getByText("Corrigez le montant reçu pour encaisser.")).toBeVisible();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC13-06-02-trop-percu");
    await grandEcran(page, 900);
  });

  await test.step("3. Saisir 0 : refusé aussi", async () => {
    const montant = page.getByLabel("Montant reçu");
    await montant.fill("0");
    await expect(montant).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: ENCAISSER_SANS_MONTANT })).toBeDisabled();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC13-06-03-montant-nul");
    await grandEcran(page, 900);
  });

  await test.step("4. Rien n'est parti ni mis en attente", async () => {
    await expect(bandeau(page)).not.toContainText("en attente");
    await capture(page, DOSSIER, "UC13-06-04-rien-en-attente", bandeau(page));
  });

  let numero = "";
  await test.step("5. Exactement 900 000 Ar, le reste dû : accepté, et le ticket prend le prochain numéro", async () => {
    await page.getByLabel("Montant reçu").fill("900000");
    await expect(page.getByText("Ce paiement solde tout ce que l'étudiant doit.")).toBeVisible();
    await boutonEncaisser(page, 900_000).click();
    numero = await numeroDuTicket(page);
    expect(numero).toBe("R-2026-00007");
    await expect(bandeau(page)).toContainText("1 paiement en attente");
    await capture(page, DOSSIER, "UC13-06-05-solde-accepte");
  });

  await test.step("6. Internet revient : le paiement part, l'étudiant ne doit plus rien", async () => {
    await poste.setOffline(false);
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
    await page.goto("/app/paiements");
    const ligne = page.getByRole("row").filter({ hasText: numero });
    await expect(ligne).toContainText(/900\s000\sAr/);
    await expect(ligne).toContainText("Valide");
    await capture(page, DOSSIER, "UC13-06-06-paiements");
  });
});
