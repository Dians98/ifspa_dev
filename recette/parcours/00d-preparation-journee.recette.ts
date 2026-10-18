import { boutonEncaisser, carte, choisirEtudiant, ETUDIANTS, grandEcran, montantRecu, recuEnregistre, testPoste as test, type EtudiantRecette } from "./aides";
import { capture, expect, SESSIONS } from "./outils";

// Section F de 00-PREPARATION.md, à lancer après 00-preparation (sections A à C) pour UC07 : quatre reçus du jour.
const DOSSIER = "00-preparation";

test.describe.configure({ mode: "serial" });

async function encaisserLibre(page: import("@playwright/test").Page, e: EtudiantRecette, montant: number) {
  await page.goto("/app/encaisser");
  await choisirEtudiant(page, e);
  await montantRecu(page).fill(String(montant));
  await boutonEncaisser(page, montant).click();
  return (await recuEnregistre(page)).numero;
}

test("F. quatre reçus du jour : trois au secrétariat, un à l'administrateur", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const numeros: string[] = [];

  await test.step("F1. Secrétariat : VOAHIRANA, droits d'inscription et octobre 2025, 180 000 Ar en espèces", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, ETUDIANTS.voahirana);
    await carte(page, "Novembre 2025").click();
    await expect(montantRecu(page)).toHaveValue(/^180\s000$/);
    await boutonEncaisser(page, 180_000).click();
    numeros.push((await recuEnregistre(page)).numero);
  });

  await test.step("F2. Secrétariat : VOAHIRANA, novembre 2025, 80 000 Ar en espèces", async () => {
    numeros.push(await encaisserLibre(page, ETUDIANTS.voahirana, 80_000));
  });

  await test.step("F3. Secrétariat : FANJA, droits et octobre 2025, 180 000 Ar en MVola", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, ETUDIANTS.fanja);
    await carte(page, "Novembre 2025").click();
    await page.getByRole("radio", { name: "Mobile Money" }).check();
    await page.getByRole("radio", { name: "MVola" }).check();
    await page.getByLabel("Référence de la transaction").fill("MP261017.0915.F03");
    await boutonEncaisser(page, 180_000).click();
    numeros.push((await recuEnregistre(page)).numero);
  });

  await test.step("F4. Administrateur : TIANA, droits d'inscription, 100 000 Ar en Orange Money", async () => {
    const contexte = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: SESSIONS.admin, viewport: { width: 1440, height: 900 } });
    try {
      const admin = await contexte.newPage();
      await admin.addInitScript(() => {
        window.print = () => {};
      });
      await admin.goto("/app/encaisser");
      await expect(admin.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
      await choisirEtudiant(admin, ETUDIANTS.tiana);
      await montantRecu(admin).fill("100000");
      await admin.getByRole("radio", { name: "Mobile Money" }).check();
      await admin.getByRole("radio", { name: "Orange Money" }).check();
      await admin.getByLabel("Référence de la transaction").fill("OM261017.1105.F04");
      await boutonEncaisser(admin, 100_000).click();
      numeros.push((await recuEnregistre(admin)).numero);

      await admin.goto("/app/paiements");
      await expect(admin.getByRole("row").filter({ hasText: numeros[0] })).toContainText("Valide");
      await grandEcran(admin, 1300);
      await capture(admin, DOSSIER, "F-01-paiements-du-jour");
    } finally {
      await contexte.close();
    }
  });

  console.log(`NUMEROS-F ${numeros.join(" ")}`);
  expect(numeros).toHaveLength(4);
});
