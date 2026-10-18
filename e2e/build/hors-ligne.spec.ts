import { Client } from "pg";
import { SESSIONS, expect, test } from "../../recette/parcours/outils";
import { creerEtudiantTest, supprimerEtudiantTest, type EtudiantTest } from "../app/mise-en-place";

// Sur le build (service worker actif) et la base de recette : `pnpm build` puis `pnpm recette:parcours --project build`.

function urlRecette(): string {
  const u = new URL(process.env.DATABASE_URL ?? "");
  u.pathname = "/ifspa_recette";
  return u.toString();
}
// Les fabriques de mise-en-place.ts lisent DATABASE_URL à chaque appel.
process.env.DATABASE_URL = urlRecette();

async function paiementDe(numeroRecu: string) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query<{ montant: number; aVerifier: boolean }>(
      `SELECT montant, "aVerifier" FROM paiement WHERE "numeroRecu" = $1`,
      [numeroRecu],
    );
    return rows[0] ?? null;
  } finally {
    await c.end();
  }
}

test.describe("Encaisser hors ligne — secrétariat", () => {
  test.use({ storageState: SESSIONS.secretariat });
  let etudiant: EtudiantTest;

  test.beforeEach(async () => {
    etudiant = await creerEtudiantTest();
  });
  test.afterEach(async () => {
    await supprimerEtudiantTest(etudiant.id);
  });

  test("encaisser sans Internet, recharger la page, puis tout part au retour du réseau", async ({ page, context }) => {
    const bandeau = page.getByRole("region", { name: "Connexion et synchronisation" });

    await page.goto("/app/encaisser");
    await expect(bandeau).toContainText("En ligne · tout est synchronisé");
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 }).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(bandeau).toContainText("Hors ligne · vous pouvez continuer à encaisser");

    // Seul Encaisser reste utilisable ; la déconnexion attend que tout soit envoyé.
    await expect(page.getByRole("button", { name: /^Étudiants Connexion nécessaire$/ })).toBeDisabled();
    await expect(page.getByRole("link", { name: /Encaisser/ }).first()).toBeVisible();

    const recherche = page.getByRole("combobox", { name: /Rechercher l'étudiant/ });
    await recherche.fill(etudiant.nom);
    await expect(page.getByRole("option", { name: new RegExp(etudiant.nom) })).toBeVisible();
    await recherche.press("Enter");
    await expect(page.getByText(/Reste à payer :\s*320\s000\sAr/)).toBeVisible();

    await page.getByRole("button", { name: new RegExp(etudiant.echeances[2]) }).click();
    await page.getByRole("button", { name: /^Encaisser 160\s000\sAr et imprimer le reçu$/ }).click();

    const succes = page.getByRole("status").filter({ hasText: /Ticket R-\d{4}-\d{5} remis/ });
    await expect(succes).toBeVisible();
    const numeroRecu = (await succes.textContent())?.match(/R-\d{4}-\d{5}/)?.[0] ?? "";
    await expect.poll(() => page.evaluate(() => (window as unknown as { __impressions: number }).__impressions)).toBe(1);
    await expect(bandeau).toContainText("1 paiement en attente");
    expect(await paiementDe(numeroRecu)).toBeNull();

    // Le paiement en file diminue déjà le reste dû affiché pour cet étudiant.
    await recherche.fill(etudiant.nom);
    await expect(page.getByRole("option", { name: new RegExp(etudiant.nom) })).toBeVisible();
    await recherche.press("Enter");
    await expect(page.getByText(/Reste à payer :\s*160\s000\sAr/)).toBeVisible();

    await context.setOffline(false);
    await expect(bandeau).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(bandeau).toContainText("1 paiement envoyé au serveur");
    expect(await paiementDe(numeroRecu)).toEqual({ montant: 160_000, aVerifier: false });
  });

  test("même échéance payée en ligne sur un autre poste pendant la coupure : enregistré, à vérifier", async ({ page, context, browser }) => {
    const bandeau = page.getByRole("region", { name: "Connexion et synchronisation" });
    await page.goto("/app/encaisser");
    await expect(bandeau).toContainText("En ligne · tout est synchronisé");
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 }).toBe(true);

    await context.setOffline(true);
    await page.reload();
    const recherche = page.getByRole("combobox", { name: /Rechercher l'étudiant/ });
    await recherche.fill(etudiant.nom);
    await expect(page.getByRole("option", { name: new RegExp(etudiant.nom) })).toBeVisible();
    await recherche.press("Enter");
    await page.getByRole("button", { name: /^Encaisser 320\s000\sAr et imprimer le reçu$/ }).click();
    const succes = page.getByRole("status").filter({ hasText: /Ticket R-\d{4}-\d{5} remis/ });
    const numeroRecu = (await succes.textContent())?.match(/R-\d{4}-\d{5}/)?.[0] ?? "";

    // Autre poste, en ligne : l'administrateur solde les mêmes mois entre-temps.
    const autrePoste = await browser.newContext({ storageState: SESSIONS.admin });
    const guichet = await autrePoste.newPage();
    await guichet.goto(`/app/encaisser?etudiant=${etudiant.id}`);
    await expect(guichet.getByLabel("Montant reçu")).toBeFocused();
    await guichet.getByRole("button", { name: /^Encaisser 320\s000\sAr et imprimer le reçu$/ }).click();
    await expect(guichet.getByRole("status").filter({ hasText: "Paiement enregistré" })).toBeVisible();
    await autrePoste.close();

    await context.setOffline(false);
    await expect(bandeau).toContainText("1 à vérifier par l'administrateur", { timeout: 20_000 });
    // L'argent reçu au guichet n'est jamais perdu : enregistré quand même, signalé à l'administrateur.
    expect(await paiementDe(numeroRecu)).toEqual({ montant: 320_000, aVerifier: true });
  });
});
