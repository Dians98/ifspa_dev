import { finImpression, grandEcran, impressions, testPoste as test, ticketImprime } from "./aides";
import { DOSSIER_UC07 as DOSSIER, ligne, ouvrirPaiements, RECUS, rechercher, total, verifierNombre, verifierTotal } from "./aides-paiements";
import { capture, expect } from "./outils";

test("UC07-04 : le secrétariat consulte Paiements et réimprime, sans pouvoir annuler", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Ouvrir Paiements par le menu : l'historique du jour, reçus annulés compris", async () => {
    await grandEcran(page, 1300);
    await page.goto("/app/encaisser");
    await page.getByRole("link", { name: "Paiements" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Historique des paiements" })).toBeVisible();
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Secrétariat", { exact: true })).toBeVisible();
    await verifierNombre(page, 4);
    await expect(total(page, "Reçus")).toContainText("2");
    await expect(total(page, "Reçus")).toContainText("+ 2 annulés");
    await verifierTotal(page, "Total encaissé", 260_000);
    await verifierTotal(page, "dont espèces", 80_000);
    await verifierTotal(page, "dont Mobile Money", 180_000);
    await expect(ligne(page, RECUS.voahiranaOctobre)).toContainText("Annulé");
    await expect(ligne(page, RECUS.tiana)).toContainText("Annulé");
    await expect(ligne(page, RECUS.voahiranaNovembre)).toContainText("Valide");
    await expect(ligne(page, RECUS.fanja)).toContainText("Valide");
    await capture(page, DOSSIER, "UC07-04-01-liste-secretariat");
  });

  await test.step("2. Aucun bouton « Annuler », ni « Marquer comme vérifié », ni « Numéros non utilisés »", async () => {
    await expect(page.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Marquer comme vérifié/ })).toHaveCount(0);
    await expect(page.getByText(/^Numéros non utilisés/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Réimprimer/ })).toHaveCount(4);
    await expect(ligne(page, RECUS.voahiranaNovembre).getByRole("button")).toHaveCount(0);
    await capture(page, DOSSIER, "UC07-04-02-sans-boutons");
  });

  await test.step("3. Chercher et filtrer restent possibles", async () => {
    await rechercher(page, "00022");
    await verifierNombre(page, 1);
    await expect(ligne(page, RECUS.voahiranaNovembre)).toContainText("RAKOTOMALALA Voahirana");
    await ouvrirPaiements(page);
    await page.getByRole("combobox", { name: "Statut" }).click();
    await page.getByRole("option", { name: "Annulés seulement" }).click();
    await verifierNombre(page, 2);
    await expect(ligne(page, RECUS.tiana)).toContainText("Paiement rejeté par l'opérateur Orange Money");
    await expect(ligne(page, RECUS.voahiranaOctobre)).toContainText("Erreur de saisie : reçu établi au mauvais nom");
    await capture(page, DOSSIER, "UC07-04-03-annules-vus-du-secretariat");
  });

  await test.step("4. Réimprimer un reçu valide : le ticket s'imprime", async () => {
    await ouvrirPaiements(page);
    await ligne(page, RECUS.fanja).getByRole("link", { name: /Réimprimer/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Reçu ${RECUS.fanja}` })).toBeVisible();
    await page.getByRole("button", { name: "Imprimer le ticket" }).click();
    expect(await impressions(page)).toBe(1);
    const ticket = await ticketImprime(page, RECUS.fanja);
    await expect(ticket).toContainText(`N° ${RECUS.fanja}`);
    await expect(ticket).not.toContainText("ANNULÉ");
    await capture(page, DOSSIER, "UC07-04-04-reimpression-valide", ticket);
    await finImpression(page);
  });

  await test.step("5. Réimprimer un reçu annulé : le secrétariat voit la mention et le motif, rien d'autre", async () => {
    await ouvrirPaiements(page);
    await ligne(page, RECUS.voahiranaOctobre).getByRole("link", { name: /Réimprimer/ }).click();
    await expect(page.getByText("Ce reçu a été annulé")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);
    const ticket = await ticketImprime(page, RECUS.voahiranaOctobre);
    await expect(ticket).toContainText("*** ANNULÉ ***");
    await expect(ticket).toContainText("Par Administrateur IFSPA");
    await capture(page, DOSSIER, "UC07-04-05-reimpression-annule", ticket);
    await finImpression(page);
  });

  await test.step("6. La fiche de l'étudiant n'offre pas non plus d'annulation", async () => {
    await page.goto("/app/paiements");
    await ligne(page, RECUS.voahiranaOctobre).getByRole("link", { name: "RAKOTOMALALA Voahirana" }).click();
    await page.getByRole("tab", { name: "Paiements (2)" }).click();
    await expect(ligne(page, RECUS.voahiranaOctobre)).toContainText("Annulé");
    await expect(page.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: `Réimprimer le reçu ${RECUS.voahiranaNovembre}` })).toBeVisible();
    await capture(page, DOSSIER, "UC07-04-06-fiche-secretariat");
  });
});
