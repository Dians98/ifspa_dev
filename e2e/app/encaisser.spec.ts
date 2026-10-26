import type { Page } from "@playwright/test";
import { COMPTES } from "./comptes";
import { expect, test } from "./mise-en-place";

// Chaque test reçoit un étudiant jetable : 4 mensualités de 80 000 Ar (janvier à avril 2020), toutes en retard.

// Sans montant valide, le bouton s'appelle « Encaisser et imprimer le reçu » (pas de montant dans le libellé).
const BOUTON_ENCAISSER = /^Encaisser( .*)? et imprimer le reçu$/;
const NUMERO_RECU = /R-\d{4}-\d{5}/;

async function ouvrirGuichet(page: Page, etudiantId: string) {
  await page.goto(`/app/encaisser?etudiant=${etudiantId}`);
  // Le focus sur le montant n'est posé qu'à l'hydratation : avant, un clic sur une case serait perdu.
  await expect(page.getByLabel("Montant reçu")).toBeFocused();
}

test.describe("Encaisser — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("encaisser deux mois, imprimer puis retrouver le reçu", async ({ page, etudiant }) => {
    await ouvrirGuichet(page, etudiant.id);

    // Rien n'est coché à l'ouverture ; cocher le 2e mois coche aussi le 1er (ordre de solde).
    await expect(page.getByLabel("Montant reçu")).toHaveValue("");
    await expect(page.getByRole("button", { name: new RegExp(etudiant.echeances[0]) })).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: new RegExp(etudiant.echeances[1]) }).click();
    await expect(page.getByLabel("Montant reçu")).toHaveValue(/^160\s000$/);
    await expect(page.getByRole("button", { name: new RegExp(etudiant.echeances[0]) })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: new RegExp(etudiant.echeances[2]) })).toHaveAttribute("aria-pressed", "false");

    const encaisser = page.getByRole("button", { name: /^Encaisser 160\s000\sAr et imprimer le reçu$/ });
    await expect(encaisser).toBeEnabled();
    await encaisser.click();

    const confirmation = page.getByRole("status").filter({ hasText: "Paiement enregistré" });
    await expect(confirmation).toContainText(NUMERO_RECU);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __impressions: number }).__impressions)).toBe(1);

    // L'écran est prêt pour le suivant : la recherche est revenue, sans confirmation intermédiaire.
    await expect(page.getByRole("combobox", { name: /Rechercher l'étudiant/ })).toBeVisible();

    await confirmation.getByRole("link", { name: "Voir le reçu" }).click();
    await page.waitForURL(/\/app\/paiements\/.+\/recu$/);
    const ticket = page.getByRole("article", { name: /^Reçu R-/ });
    await expect(ticket).toContainText(/N° R-\d{4}-\d{5}/);
    await expect(ticket).toContainText("cent soixante mille ariary");
    await expect(ticket).toContainText(etudiant.nom);
    await expect(ticket).toContainText(/Reste à payer\s*160\s000\sAr/);
  });

  test("100 000 Ar pour une échéance de 80 000 Ar : le surplus part en acompte", async ({ page, etudiant }) => {
    await ouvrirGuichet(page, etudiant.id);

    await page.getByLabel("Montant reçu").fill("100000");
    await expect(page.getByText(/20\s000\sAr d'acompte sur février, il restera 60\s000\sAr\./)).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(etudiant.echeances[0]) })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: new RegExp(etudiant.echeances[1]) })).toHaveAttribute("aria-pressed", "mixed");

    await page.getByRole("button", { name: /^Encaisser 100\s000\sAr et imprimer le reçu$/ }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Paiement enregistré" })
      .getByRole("link", { name: "Voir le reçu" })
      .click();
    await page.waitForURL(/\/app\/paiements\/.+\/recu$/);
    const ticket = page.getByRole("article", { name: /^Reçu R-/ });
    await expect(ticket).toContainText(/Acompte · reste dû 60\s000\sAr/);
    await expect(ticket).toContainText("cent mille ariary");
  });

  test("Mobile Money : opérateur et référence sont exigés avant d'encaisser", async ({ page, etudiant }) => {
    await ouvrirGuichet(page, etudiant.id);
    const encaisser = page.getByRole("button", { name: BOUTON_ENCAISSER });
    // Rien n'est prérempli : un montant valide d'abord, pour que seuls l'opérateur et la référence bloquent.
    await page.getByLabel("Montant reçu").fill("80000");

    await page.getByRole("radio", { name: "Mobile Money" }).check();
    await expect(encaisser).toBeDisabled();
    await expect(page.getByText("Choisissez l'opérateur Mobile Money.")).toBeVisible();

    await page.getByRole("radio", { name: "MVola" }).check();
    await expect(encaisser).toBeDisabled();
    await expect(page.getByText("Saisissez la référence de la transaction Mobile Money.")).toBeVisible();

    await page.getByLabel("Référence de la transaction").fill("MP261011.1234.A15");
    await expect(encaisser).toBeEnabled();
  });

  test("un montant au-delà de ce que l'étudiant doit est refusé", async ({ page, etudiant }) => {
    await ouvrirGuichet(page, etudiant.id);

    // 4 × 80 000 = 320 000 Ar dus au total.
    await page.getByLabel("Montant reçu").fill("400000");
    await expect(page.getByLabel("Montant reçu")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert").filter({ hasText: /dépasse ce que l'étudiant doit encore/ })).toContainText(/320\s000\sAr au plus/);
    await expect(page.getByRole("button", { name: BOUTON_ENCAISSER })).toBeDisabled();
    await expect(page.getByText("Corrigez le montant reçu pour encaisser.")).toBeVisible();
  });

  test("recherche au clavier : taper, Entrée, la situation s'affiche", async ({ page, etudiant }) => {
    await page.goto("/app/encaisser");
    const recherche = page.getByRole("combobox", { name: /Rechercher l'étudiant/ });
    await expect(recherche).toBeFocused();

    await recherche.fill(etudiant.nom);
    await expect(page.getByRole("option", { name: new RegExp(etudiant.nom) })).toBeVisible();
    await recherche.press("Enter");

    await expect(page.getByText(/Reste à payer :\s*320\s000\sAr/)).toBeVisible();
    await expect(page.getByText(etudiant.nomComplet).first()).toBeVisible();
    await page.getByRole("button", { name: /Changer/ }).click();
    await expect(page.getByRole("combobox", { name: /Rechercher l'étudiant/ })).toBeVisible();
  });
});
