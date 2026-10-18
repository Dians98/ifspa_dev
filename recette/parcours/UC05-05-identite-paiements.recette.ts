import { boutonEncaisser, choisirEtudiant, ETUDIANTS, montantRecu, recuEnregistre } from "./aides";
import { DOSSIER_UC05 as DOSSIER, ouvrirFicheDe } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });

const NOTE = "Versé par son oncle, reçu papier n° 0457";

test("UC05-05 : identité, contact et historique des paiements, avec la note du guichet", async ({ page }) => {
  test.setTimeout(150_000);
  let numero = "";

  await test.step("1. L'onglet Identité de RAKOTOMALALA Voahirana : état civil, contact, année d'entrée", async () => {
    await ouvrirFicheDe(page, "RAKOTOMALALA", "IF-2025-0001");
    await page.getByRole("tab", { name: "Identité" }).click();
    const identite = page.getByRole("tabpanel", { name: "Identité" });
    await expect(identite.getByRole("heading", { name: "État civil et contact" })).toBeVisible();
    const valeur = (libelle: string) => identite.locator("dt", { hasText: new RegExp(`^${libelle}$`) }).locator("xpath=following-sibling::dd[1]");
    await expect(valeur("Nom")).toHaveText("RAKOTOMALALA");
    await expect(valeur("Prénoms")).toHaveText("Voahirana");
    await expect(valeur("Sexe")).toHaveText("Féminin");
    await expect(valeur("Date de naissance")).toHaveText("14/03/2005");
    await expect(valeur("Lieu de naissance")).toHaveText("Toamasina");
    await expect(valeur("CIN")).toHaveText("Non renseigné");
    await expect(valeur("Téléphone")).toHaveText("034 00 000 01");
    await expect(valeur("Téléphone").getByRole("link")).toHaveAttribute("href", "tel:0340000001");
    await expect(valeur("E-mail")).toHaveText("Non renseigné");
    await expect(valeur("Adresse")).toHaveText("Lot II B 12, Tanambao V, Toamasina");
    await expect(valeur("Année d'entrée")).toHaveText("2025-2026");
    await expect(valeur("Inscrit par")).toHaveText("Hanitra RAKOTO");
    await capture(page, DOSSIER, "UC05-05-01-identite");
  });

  await test.step("2. L'onglet Paiements (1) : le reçu R-2026-00021, validé, avec son caissier et « Réimprimer »", async () => {
    await page.getByRole("tab", { name: "Paiements (1)" }).click();
    const panneau = page.getByRole("tabpanel", { name: /Paiements/ });
    await expect(panneau.getByText("Reçus émis pour cet étudiant, du plus récent au plus ancien.")).toBeVisible();
    const ligne = panneau.getByRole("row").filter({ hasText: "R-2026-00021" });
    await expect(ligne).toContainText(/180\s000\sAr/);
    await expect(ligne).toContainText("Espèces");
    await expect(ligne).toContainText("Hanitra RAKOTO");
    await expect(ligne).toContainText("Validé");
    await expect(ligne.getByRole("link", { name: "Réimprimer le reçu R-2026-00021" })).toBeVisible();
    await capture(page, DOSSIER, "UC05-05-02-paiements");
  });

  await test.step("3. Guichet : RABEMANANJARA Lalaina verse 100 000 Ar avec une note « reçu papier »", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, ETUDIANTS.lalaina);
    await montantRecu(page).fill("100000");
    await page.getByRole("button", { name: "Ajouter une note" }).click();
    await page.getByLabel("Note (facultatif)").fill(NOTE);
    await boutonEncaisser(page, 100_000).click();
    const r = await recuEnregistre(page);
    numero = r.numero;
    expect(numero).toMatch(/^R-2026-\d{5}$/);
  });

  await test.step("4. Sa fiche, onglet Paiements : le reçu porte la note sous son statut", async () => {
    await ouvrirFicheDe(page, "RABEMANANJARA", "SF-2025-0002");
    await page.getByRole("tab", { name: "Paiements (1)" }).click();
    const ligne = page.getByRole("tabpanel", { name: /Paiements/ }).getByRole("row").filter({ hasText: numero });
    await expect(ligne).toContainText(/100\s000\sAr/);
    await expect(ligne).toContainText("Validé");
    await expect(ligne).toContainText(NOTE);
    await capture(page, DOSSIER, "UC05-05-04-paiement-avec-note");
  });

  await test.step("5. Un étudiant sans paiement : « Aucun paiement enregistré. » et le bouton Encaisser", async () => {
    await ouvrirFicheDe(page, "RAZAFINDRAKOTO", "SF-2025-0001");
    await page.getByRole("tab", { name: "Paiements (0)" }).click();
    const panneau = page.getByRole("tabpanel", { name: /Paiements/ });
    await expect(panneau.getByText("Aucun paiement enregistré. Les reçus apparaissent ici après le premier encaissement.")).toBeVisible();
    await expect(panneau.getByRole("link", { name: "Encaisser" })).toBeVisible();
    await capture(page, DOSSIER, "UC05-05-05-aucun-paiement");
  });
});
