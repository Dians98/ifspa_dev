import {
  boutonEncaisser,
  carte,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  grandEcran,
  montantRecu,
  recuEnregistre,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC06-encaisser";
const E = ETUDIANTS.nirina;

test("UC06-03 : un montant libre, acompte sur le mois suivant puis paiement en partie", async ({ page }) => {
  test.setTimeout(90_000);

  await test.step("1. Étudiant à jour : rien n'est coché d'office", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*900\s000\sAr/)).toBeVisible();
    await expect(montantRecu(page)).toHaveValue("");
    await expect(page.getByText("Cochez une échéance ou saisissez le montant reçu.")).toBeVisible();
    await expect(carte(page, "Droits d'inscription")).toHaveAttribute("aria-pressed", "false");
  });

  await test.step("2. Saisir 130 000 Ar pour des droits de 100 000 Ar : le surplus part en acompte", async () => {
    await montantRecu(page).fill("130000");
    await expect(page.getByText(/30\s000\sAr d'acompte sur octobre, il restera 50\s000\sAr\./)).toBeVisible();
    await expect(carte(page, "Droits d'inscription")).toHaveAttribute("aria-pressed", "true");
    await expect(carte(page, "Octobre 2026")).toHaveAttribute("aria-pressed", "mixed");
    await expect(page.getByText(/Après ce paiement, il restera\s*770\s000\sAr à payer\./)).toBeVisible();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC06-03-02-acompte");
    await grandEcran(page, 900);
  });

  let premier = "";
  await test.step("3. Encaisser 130 000 Ar : le ticket montre l'acompte", async () => {
    await boutonEncaisser(page, 130_000).click();
    premier = (await recuEnregistre(page)).numero;
    const ticket = await ticketImprime(page, premier);
    await expect(ticket).toContainText("Droits d'inscription");
    await expect(ticket).toContainText("Octobre 2026");
    await expect(ticket).toContainText(/Acompte · reste dû 50\s000\sAr/);
    await expect(ticket).toContainText("cent trente mille ariary");
    await expect(ticket).toContainText("Néant, à jour");
    await expect(ticket).toContainText(/Reste à payer\s*770\s000\sAr/);
    await capture(page, DOSSIER, "UC06-03-03-ticket-acompte", ticket);
    await finImpression(page);
  });

  await test.step("4. Le parent revient avec 20 000 Ar, moins que les 50 000 Ar qui restent sur octobre", async () => {
    await choisirEtudiant(page, E);
    await expect(carte(page, "Octobre 2026")).toContainText("déjà 30 000 Ar");
    await montantRecu(page).fill("20000");
    await expect(carte(page, "Octobre 2026")).toHaveAttribute("aria-pressed", "mixed");
    await expect(carte(page, "Octobre 2026")).toContainText("reste 30 000 Ar");
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC06-03-04-paiement-en-partie");
    await grandEcran(page, 900);
  });

  let second = "";
  await test.step("5. Encaisser 20 000 Ar", async () => {
    await boutonEncaisser(page, 20_000).click();
    second = (await recuEnregistre(page)).numero;
    const ticket = await ticketImprime(page, second);
    await expect(ticket).toContainText("Octobre 2026");
    await expect(ticket).toContainText(/Acompte · reste dû 30\s000\sAr/);
    await expect(ticket).toContainText("vingt mille ariary");
    await expect(ticket).toContainText(/Reste à payer\s*750\s000\sAr/);
    await capture(page, DOSSIER, "UC06-03-05-ticket-en-partie", ticket);
    await finImpression(page);
  });

  await test.step("6. La fiche : octobre est « Partiel »", async () => {
    await page.goto("/app/paiements");
    await page.getByRole("row").filter({ hasText: second }).getByRole("link", { name: `${E.nom} ${E.prenoms}` }).click();
    await expect(page.getByRole("tab", { name: "Paiements (2)" })).toBeVisible();
    await expect(page.getByText("Partiel").first()).toBeVisible();
    await grandEcran(page, 1500);
    await capture(page, DOSSIER, "UC06-03-06-fiche-partiel");
  });
});
