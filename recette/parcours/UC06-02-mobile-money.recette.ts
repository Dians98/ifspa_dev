import {
  boutonEncaisser,
  carte,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  grandEcran,
  logoAffiche,
  montantRecu,
  recuEnregistre,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC06-encaisser";
const E = ETUDIANTS.lalaina;
const REFERENCE = "AM261017.1430.C07";

test("UC06-02 : un parent paie en Mobile Money (Airtel Money)", async ({ page }) => {
  test.setTimeout(90_000);

  await test.step("1. Chercher l'étudiante, garder les droits et octobre", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, E);
    await carte(page, "Novembre 2025").click();
    await expect(montantRecu(page)).toHaveValue(/^180\s000$/);
  });

  await test.step("2. Mobile Money sans opérateur : le bouton attend", async () => {
    await page.getByRole("radio", { name: "Mobile Money" }).check();
    await expect(page.getByText("Choisissez l'opérateur Mobile Money.")).toBeVisible();
    await expect(boutonEncaisser(page, 180_000)).toBeDisabled();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC06-02-02-operateur-manquant");
  });

  await test.step("3. Airtel Money, puis la référence du SMS", async () => {
    await page.getByRole("radio", { name: "Airtel Money" }).check();
    await expect(page.getByText("Saisissez la référence de la transaction Mobile Money.")).toBeVisible();
    await expect(boutonEncaisser(page, 180_000)).toBeDisabled();
    await page.getByLabel("Référence de la transaction").fill(REFERENCE);
    await expect(boutonEncaisser(page, 180_000)).toBeEnabled();
    await expect(page.getByText("Droits d'inscription → Octobre 2025 · 2 échéances soldées · Mobile Money Airtel Money")).toBeVisible();
    await capture(page, DOSSIER, "UC06-02-03-airtel-reference");
    await grandEcran(page, 900);
  });

  let numero = "";
  await test.step("4. Encaisser 180 000 Ar", async () => {
    await boutonEncaisser(page, 180_000).click();
    const r = await recuEnregistre(page);
    numero = r.numero;
    await expect(r.zone).toContainText(/180\s000\sAr · Mobile Money · RABEMANANJARA Lalaina\. Reste à payer : 720\s000\sAr\./);
    await capture(page, DOSSIER, "UC06-02-04-recu-enregistre");
  });

  await test.step("5. Le ticket imprimé porte le mode et la référence", async () => {
    const ticket = await ticketImprime(page, numero);
    await expect(ticket).toContainText("Mobile Money · Airtel Money");
    await expect(ticket).toContainText("Réf.");
    await expect(ticket).toContainText(REFERENCE);
    await expect(ticket).toContainText("cent quatre-vingt mille ariary");
    expect(await logoAffiche(ticket)).toBe(true);
    await capture(page, DOSSIER, "UC06-02-05-ticket-imprime", ticket);
    await finImpression(page);
  });

  await test.step("6. Paiements, filtre Airtel Money", async () => {
    await page.goto("/app/paiements");
    await page.getByRole("combobox", { name: "Mode de paiement" }).click();
    await page.getByRole("option", { name: "Airtel Money" }).click();
    const ligne = page.getByRole("row").filter({ hasText: numero });
    await expect(ligne).toContainText("Mobile Money · Airtel Money");
    await expect(ligne).toContainText(REFERENCE);
    await expect(page.getByRole("row").filter({ hasText: "R-2026-00021" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC06-02-06-paiements-airtel");
  });
});
