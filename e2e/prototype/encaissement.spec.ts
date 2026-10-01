import { expect, test } from "@playwright/test";
import { maquette } from "./maquette";

// Étudiante 4 (SF-2026-0002) au 12/03/2027 : droits, octobre et novembre payés ;
// décembre à mars en retard, soit 4 × 80 000 = 320 000 Ar précochés.
const ETUDIANTE_EN_RETARD = "encaissement.html?id=4";

const chiffres = (valeur: string) => valeur.replace(/\D/g, "");

test.describe("Maquette Encaisser : paiement partiel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(maquette(ETUDIANTE_EN_RETARD));
  });

  test("le montant reçu est prérempli avec les échéances en retard", async ({ page }) => {
    const montant = page.locator("#montant");
    await expect(montant).toBeVisible();
    expect(chiffres(await montant.inputValue())).toBe("320000");
    await expect(page.locator("#encaisser")).toContainText(/320\s000\sAr/);
  });

  test("un surplus part en acompte sur le mois suivant", async ({ page }) => {
    await page.locator("#montant").fill("340000");
    await expect(page.locator("#repartition")).toContainText(/20\s000\sAr d'acompte sur avril 2027/);
    await expect(page.locator("#repartition")).toContainText(/60\s000\sAr/);
    await expect(page.locator("#encaisser")).toContainText(/340\s000\sAr/);
    await expect(page.locator("#encaisser")).toBeEnabled();
  });

  test("un montant inférieur paie la dernière échéance en partie", async ({ page }) => {
    await page.locator("#montant").fill("300000");
    await expect(page.locator("#repartition")).toContainText(/60\s000\sAr.*mars 2027/);
    await expect(page.locator("#repartition")).toContainText(/20\s000\sAr/);
    await expect(page.locator("#encaisser")).toBeEnabled();
  });

  test("un montant supérieur au reste de l'année est refusé", async ({ page }) => {
    // Reste de l'année : 900 000 − 260 000 = 640 000 Ar
    await page.locator("#montant").fill("640001");
    await expect(page.locator("#montant-erreur")).toBeVisible();
    await expect(page.locator("#montant-erreur")).toContainText(/640\s000\sAr/);
    await expect(page.locator("#encaisser")).toBeDisabled();
  });

  test("cocher une case remet le montant à la somme des cases", async ({ page }) => {
    await page.locator("#montant").fill("340000");
    // Avril n'est pas précoché : le cocher couvre décembre à avril, soit 5 × 80 000 Ar.
    await page.locator("#cases").getByText("avr.", { exact: false }).first().click();
    expect(chiffres(await page.locator("#montant").inputValue())).toBe("400000");
  });

  test("encaisser avec un acompte affiche le reçu et rappelle l'acompte", async ({ page }) => {
    await page.locator("#montant").fill("340000");
    await page.locator("#encaisser").click();
    await expect(page.locator("#succes")).toBeVisible();
    await expect(page.locator("#succes")).toContainText(/acompte/i);
  });
});
