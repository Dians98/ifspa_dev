import { finImpression, grandEcran, ticketImprime } from "./aides";
import { choisirFiltre, DOSSIER_UC07 as DOSSIER, ligne, ouvrirPaiements, RECUS, rechercher, total, verifierNombre, verifierTotal } from "./aides-paiements";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

test("UC07-01 : l'administrateur contrôle la journée, retrouve un reçu et le réimprime", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Ouvrir Paiements : les quatre reçus du jour et les totaux de caisse", async () => {
    await ouvrirPaiements(page);
    await expect(page.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^Aujourd'hui, \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
    await verifierTotal(page, "Total encaissé", 540_000);
    await verifierTotal(page, "dont espèces", 260_000);
    await verifierTotal(page, "dont Mobile Money", 280_000);
    await expect(total(page, "Reçus")).toHaveText("4");
    await verifierNombre(page, 4);
    await expect(page.getByText("Reçus 1 à 4 sur 4")).toBeVisible();
    await expect(page.getByText("Valide", { exact: true })).toHaveCount(4);
    await capture(page, DOSSIER, "UC07-01-01-liste-du-jour");
  });

  await test.step("2. Retrouver un reçu par son numéro", async () => {
    await rechercher(page, "00023");
    await verifierNombre(page, 1);
    const l = ligne(page, RECUS.fanja);
    await expect(l).toContainText("RASOANAIVO Fanja");
    await expect(l).toContainText("Mobile Money · MVola");
    await expect(l).toContainText("MP261017.0915.F03");
    await expect(l).toContainText("Hanitra RAKOTO");
    await verifierTotal(page, "Total encaissé", 180_000);
    await verifierTotal(page, "dont Mobile Money", 180_000);
    await capture(page, DOSSIER, "UC07-01-02-recherche-numero");
  });

  await test.step("3. Retrouver les reçus d'un étudiant par son nom", async () => {
    await ouvrirPaiements(page);
    await rechercher(page, "voahirana");
    await verifierNombre(page, 2);
    await expect(ligne(page, RECUS.voahiranaOctobre)).toContainText("RAKOTOMALALA Voahirana");
    await expect(ligne(page, RECUS.voahiranaNovembre)).toContainText("RAKOTOMALALA Voahirana");
    await verifierTotal(page, "Total encaissé", 260_000);
    await capture(page, DOSSIER, "UC07-01-03-recherche-nom");
  });

  await test.step("4. Filtrer par mode : Mobile Money (tous), puis Espèces", async () => {
    await ouvrirPaiements(page);
    await choisirFiltre(page, "Mode de paiement", "Mobile Money (tous)");
    await verifierNombre(page, 2);
    await expect(ligne(page, RECUS.fanja)).toBeVisible();
    await expect(ligne(page, RECUS.tiana)).toBeVisible();
    await verifierTotal(page, "Total encaissé", 280_000);
    await verifierTotal(page, "dont espèces", 0);
    await capture(page, DOSSIER, "UC07-01-04-mode-mobile-money");
    await choisirFiltre(page, "Mode de paiement", "Espèces");
    await verifierNombre(page, 2);
    await verifierTotal(page, "Total encaissé", 260_000);
    await verifierTotal(page, "dont Mobile Money", 0);
    await capture(page, DOSSIER, "UC07-01-04-mode-especes");
  });

  await test.step("5. Filtrer par caissier : l'administrateur, puis Hanitra RAKOTO", async () => {
    await ouvrirPaiements(page);
    await choisirFiltre(page, "Caissier", "Administrateur IFSPA");
    await verifierNombre(page, 1);
    await expect(ligne(page, RECUS.tiana)).toContainText("Administrateur IFSPA");
    await verifierTotal(page, "Total encaissé", 100_000);
    await capture(page, DOSSIER, "UC07-01-05-caissier-admin");
    await choisirFiltre(page, "Caissier", "Hanitra RAKOTO");
    await verifierNombre(page, 3);
    await verifierTotal(page, "Total encaissé", 440_000);
  });

  await test.step("6. Filtrer par statut : « Annulés seulement » est vide, aucun reçu n'a été annulé", async () => {
    await ouvrirPaiements(page);
    await choisirFiltre(page, "Statut", "Annulés seulement");
    await expect(page.getByText(/^Aucun paiement ne correspond à ces filtres\./)).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir ce mois-ci" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Effacer les filtres" })).toBeVisible();
    await expect(page.getByText("Aucun reçu", { exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC07-01-06-annules-vide");
    await choisirFiltre(page, "Statut", "À vérifier");
    await expect(page.getByText(/^Aucun paiement ne correspond à ces filtres\./)).toBeVisible();
    await choisirFiltre(page, "Statut", "Valides seulement");
    await verifierNombre(page, 4);
  });

  await test.step("7. Changer de période : un mois, une année scolaire", async () => {
    await ouvrirPaiements(page);
    await choisirFiltre(page, "Type de période", "Un mois");
    await expect(page.getByText("Octobre 2026", { exact: true })).toBeVisible();
    await verifierNombre(page, 4);
    await verifierTotal(page, "Total encaissé", 540_000);
    await capture(page, DOSSIER, "UC07-01-07-un-mois");
    await choisirFiltre(page, "Type de période", "Une année scolaire");
    await expect(page.getByText("Année 2026-2027", { exact: true })).toBeVisible();
    await verifierNombre(page, 4);
    await choisirFiltre(page, "Année scolaire", "2025-2026");
    await expect(page.getByText("Année 2025-2026", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Aucun paiement ne correspond à ces filtres\./)).toBeVisible();
    await capture(page, DOSSIER, "UC07-01-07-annee-2025-vide");
  });

  await test.step("8. Réimprimer le reçu de FANJA : même ticket que celui remis", async () => {
    await ouvrirPaiements(page);
    await ligne(page, RECUS.fanja).getByRole("link", { name: /Réimprimer/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Reçu ${RECUS.fanja}` })).toBeVisible();
    await expect(page.getByText(/RASOANAIVO Fanja · 180\s000\sAr · \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}/)).toBeVisible();
    await expect(page.getByText("Ce reçu a été annulé")).toHaveCount(0);
    await grandEcran(page, 1500);
    await capture(page, DOSSIER, "UC07-01-08-reimpression-apercu");
    const ticket = await ticketImprime(page, RECUS.fanja);
    await expect(ticket).toContainText(`N° ${RECUS.fanja}`);
    await expect(ticket).toContainText("Mobile Money · MVola");
    await expect(ticket).toContainText("MP261017.0915.F03");
    await expect(ticket).toContainText("cent quatre-vingt mille ariary");
    await expect(ticket).toContainText(/Reste à payer\s*720\s000\sAr/);
    await expect(ticket).not.toContainText("ANNULÉ");
    await capture(page, DOSSIER, "UC07-01-08-reimpression-ticket", ticket);
    await finImpression(page);
    await page.getByRole("button", { name: "Imprimer le ticket" }).click();
    expect(await page.evaluate(() => (window as unknown as { __impressions: number }).__impressions)).toBe(1);
  });

  await test.step("9. « Numéros non utilisés » : les numéros gardés par les deux postes", async () => {
    await ouvrirPaiements(page);
    await grandEcran(page, 1700);
    await page.getByText(/^Numéros non utilisés/).click();
    await expect(page.getByText(/numéros? encore détenus? par les postes/)).toBeVisible();
    await expect(page.getByRole("main").getByText("Hanitra RAKOTO").first()).toBeVisible();
    await expect(page.getByRole("main").getByText("Administrateur IFSPA").first()).toBeVisible();
    await capture(page, DOSSIER, "UC07-01-09-numeros-non-utilises");
  });
});
