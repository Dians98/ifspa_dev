import { boutonEncaisser, choisirEtudiant, ETUDIANTS, montantRecu, recuEnregistre, testPoste as test, type EtudiantRecette } from "./aides";
import { capture, expect } from "./outils";

// Section G de 00-PREPARATION.md, à lancer après 00-preparation (sections A à C) pour UC08 et UC09 : deux paiements au guichet.
const DOSSIER = "00-preparation";

test.describe.configure({ mode: "serial" });

async function encaisserLibre(page: import("@playwright/test").Page, e: EtudiantRecette, montant: number) {
  await page.goto("/app/encaisser");
  await choisirEtudiant(page, e);
  await montantRecu(page).fill(String(montant));
  await boutonEncaisser(page, montant).click();
  return recuEnregistre(page);
}

test("G. trois paiements du guichet : deux avec acompte, un complet sur les droits et octobre", async ({ page }) => {
  test.setTimeout(90_000);
  const numeros: string[] = [];

  await test.step("G1. Secrétariat : VOAHIRANA paie 180 000 Ar (droits d'inscription et octobre 2025) en espèces", async () => {
    const { numero } = await encaisserLibre(page, ETUDIANTS.voahirana, 180_000);
    numeros.push(numero);
    await expect(page.getByText(/Reste à payer :/)).toBeVisible();
  });

  await test.step("G2. Secrétariat : FANJA paie 130 000 Ar (100 000 Ar de droits et 30 000 Ar d'acompte sur octobre 2025)", async () => {
    const { numero } = await encaisserLibre(page, ETUDIANTS.fanja, 130_000);
    numeros.push(numero);
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /RASOANAIVO Fanja/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RASOANAIVO");
    await expect(page.getByText("Droits payés en une fois")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Encaisser 770\s000\sAr$/ }).or(page.getByRole("link", { name: /^Encaisser 770\s000\sAr$/ }))).toBeVisible();
    await capture(page, DOSSIER, "G-01-fiche-fanja-acompte");
  });

  await test.step("G3. Secrétariat : NIRINA paie 150 000 Ar (droits d'inscription et 50 000 Ar d'acompte sur octobre 2026)", async () => {
    const { numero } = await encaisserLibre(page, ETUDIANTS.nirina, 150_000);
    numeros.push(numero);
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /RAKOTOARISOA Nirina/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RAKOTOARISOA");
    await expect(page.getByText("Partiel").first()).toBeVisible();
    await capture(page, DOSSIER, "G-02-fiche-nirina-partiel");
  });

  console.log(`NUMEROS-G ${numeros.join(" ")}`);
  expect(numeros).toHaveLength(3);
});
