import type { Page } from "@playwright/test";
import { COMPTES } from "./comptes";
import { expect, test, type EtudiantTest } from "./mise-en-place";

/** Encaisse tout ce qui est en retard (cases cochées d'office) et renvoie le numéro du reçu. */
async function encaisserTout(page: Page, etudiant: EtudiantTest): Promise<string> {
  await page.goto(`/app/encaisser?etudiant=${etudiant.id}`);
  // Le focus sur le montant n'est posé qu'à l'hydratation : avant, le clic serait perdu.
  await expect(page.getByLabel("Montant reçu")).toBeFocused();
  await page.getByRole("button", { name: /^Encaisser .* et imprimer le reçu$/ }).click();
  const confirmation = page.getByRole("status").filter({ hasText: "Paiement enregistré" });
  await expect(confirmation).toBeVisible();
  const numero = /R-\d{4}-\d{5}/.exec(await confirmation.innerText());
  if (!numero) throw new Error("Numéro de reçu introuvable dans la confirmation.");
  return numero[0];
}

async function retrouverDansPaiements(page: Page, numero: string) {
  await page.goto("/app/paiements");
  await page.getByRole("searchbox", { name: "Rechercher un reçu, un étudiant, une note ou un n° de reçu papier" }).fill(numero);
  // La recherche met l'adresse à jour après une courte pause : un clic avant écraserait la navigation.
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole("link", { name: numero }).first()).toBeVisible();
}

test.describe("Paiements — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("retrouver et réimprimer un reçu, sans pouvoir l'annuler", async ({ page, etudiant }) => {
    const numero = await encaisserTout(page, etudiant);
    await retrouverDansPaiements(page, numero);

    await expect(page.getByText("Total encaissé")).toBeVisible();
    await expect(page.getByRole("link", { name: `Réimprimer le reçu ${numero}` })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);

    await page.getByRole("link", { name: `Réimprimer le reçu ${numero}` }).click();
    await page.waitForURL(/\/app\/paiements\/.+\/recu$/);
    await expect(page.getByRole("article", { name: new RegExp(`^Reçu ${numero}`) })).toContainText(`N° ${numero}`);
    await page.getByRole("button", { name: "Imprimer le ticket" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __impressions: number }).__impressions)).toBe(1);
  });

  test("un reçu inconnu est signalé avec la marche à suivre", async ({ page }) => {
    await page.goto("/app/paiements/introuvable/recu");
    await expect(page.getByRole("heading", { level: 1, name: "Reçu introuvable" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour aux paiements" })).toBeVisible();
  });
});

test.describe("Paiements — administrateur", () => {
  test.use({ storageState: COMPTES.admin.session });

  test("annuler un reçu avec un motif : la ligne passe à ANNULÉ", async ({ page, etudiant }) => {
    const numero = await encaisserTout(page, etudiant);
    await retrouverDansPaiements(page, numero);

    await page.getByRole("button", { name: `Annuler le reçu ${numero}` }).click();
    const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${numero}` });

    // Le motif est obligatoire : rien n'est annulé sans lui.
    await dialogue.getByRole("button", { name: `Annuler le reçu ${numero}` }).click();
    await expect(dialogue.getByLabel("Motif de l'annulation")).toHaveAttribute("aria-invalid", "true");
    await expect(dialogue.getByText(/Indiquez le motif/)).toBeVisible();

    await dialogue.getByLabel("Motif de l'annulation").fill("Doublon de saisie");
    await dialogue.getByRole("button", { name: `Annuler le reçu ${numero}` }).click();
    await expect(dialogue).toBeHidden();

    await expect(page.getByText("Annulé", { exact: true })).toBeVisible();
    await expect(page.getByText(/Doublon de saisie/)).toBeVisible();
    await expect(page.getByRole("button", { name: `Annuler le reçu ${numero}` })).toHaveCount(0);

    // La réimpression porte la mention ANNULÉ.
    await page.getByRole("link", { name: `Réimprimer le reçu ${numero}` }).click();
    await expect(page.getByRole("article", { name: /annulé/ })).toContainText("ANNULÉ");
  });
});
