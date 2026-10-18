import { boutonEncaisser, choisirEtudiant, montantRecu, recuEnregistre } from "./aides";
import { DOSSIER_UC10 as DOSSIER, ouvrirAdmissions } from "./aides-admissions";
import { ligne } from "./aides-paiements";
import { capture, expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });

const MOTIF = "Versement saisi sur le mauvais étudiant";
let numeroRecu = "";

test.describe("UC10-06 : le secrétariat encaisse sur la nouvelle année", () => {
  test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1000 } });

  test("RAZAFINDRAKOTO Mialy verse 1 000 000 Ar : 2025-2026 est soldé, le reste va sur 2026-2027", async ({ page }) => {
    await test.step("1. Encaisser 1 000 000 Ar : le surplus tombe sur la nouvelle inscription", async () => {
      await page.goto("/app/encaisser");
      await choisirEtudiant(page, { nom: "RAZAFINDRAKOTO" });
      await expect(page.getByText(/Reste à payer :\s*1\s800\s000\sAr/)).toBeVisible();
      await montantRecu(page).fill("1000000");
      await boutonEncaisser(page, 1_000_000).click();
      const succes = await recuEnregistre(page);
      numeroRecu = succes.numero;
      console.log(`NUMERO-UC10-06 ${numeroRecu}`);
      await page.setViewportSize({ width: 1440, height: 1500 });
      await capture(page, DOSSIER, "UC10-06-01-encaissement-mialy");
    });

    await test.step("2. La fiche : 2025-2026 soldé, 100 000 Ar sur les droits 2026-2027", async () => {
      await page.goto("/app/etudiants");
      await page.getByRole("link", { name: /RAZAFINDRAKOTO Mialy/ }).first().click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("RAZAFINDRAKOTO Mialy");
      await expect(page.getByText(/Dû\s900\s000\sAr\s·\sPayé\s900\s000\sAr\s·\sAnnée soldée/)).toBeVisible();
      await expect(page.getByText(/Dû\s900\s000\sAr\s·\sPayé\s100\s000\sAr\s·\sReste\s800\s000\sAr/)).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 1800 });
      await capture(page, DOSSIER, "UC10-06-02-fiche-mialy-paye");
    });
  });
});

test.describe("UC10-06 : l'administrateur essaie d'annuler le passage", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1000 } });

  test("annulation refusée : un reçu existe sur les nouvelles inscriptions, même s'il est annulé ensuite", async ({ page }) => {
    test.setTimeout(120_000);

    await test.step("3. Historique : « Annuler » sur le passage des Sage-femmes 1re année", async () => {
      await ouvrirAdmissions(page);
      await page.getByRole("link", { name: "Historique" }).click();
      await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
      await expect(page.getByText("Vous pouvez annuler un passage tant qu'aucun reçu n'existe sur les inscriptions qu'il a créées.")).toBeVisible();
      await page.getByRole("button", { name: /^Annuler le passage Sage-femmes 1re année du / }).click();
      const dialogue = page.getByRole("dialog", { name: "Annulation impossible" });
      await expect(dialogue).toBeVisible();
      console.log(`DIALOGUE-BLOQUE ${await dialogue.innerText()}`);
      await capture(page, DOSSIER, "UC10-06-03-annulation-impossible", dialogue);
    });

    await test.step("4. Le reçu cité s'ouvre", async () => {
      const dialogue = page.getByRole("dialog", { name: "Annulation impossible" });
      await expect(dialogue.getByRole("heading", { name: "Reçus concernés (1)" })).toBeVisible();
      await expect(dialogue.getByRole("link", { name: numeroRecu })).toBeVisible();
      await expect(dialogue.getByRole("button", { name: "Annuler le passage" })).toHaveCount(0);
      await dialogue.getByRole("button", { name: "Fermer" }).first().click();
      await expect(dialogue).toBeHidden();
    });

    await test.step("5. Annuler le reçu dans Paiements", async () => {
      await page.goto("/app/paiements");
      await ligne(page, numeroRecu).getByRole("button", { name: `Annuler le reçu ${numeroRecu}` }).click();
      const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${numeroRecu}` });
      await dialogue.getByLabel("Motif de l'annulation").fill(MOTIF);
      await dialogue.getByRole("button", { name: `Annuler le reçu ${numeroRecu}` }).click();
      await expect(dialogue).toBeHidden();
      await expect(page.getByText(`Reçu ${numeroRecu} annulé : les échéances qu'il payait sont de nouveau dues.`)).toBeVisible();
      await expect(ligne(page, numeroRecu)).toContainText("Annulé");
      await capture(page, DOSSIER, "UC10-06-05-recu-annule");
    });

    await test.step("6. Encore impossible : un reçu annulé bloque aussi", async () => {
      await page.goto("/app/admissions/historique");
      await page.getByRole("button", { name: /^Annuler le passage Sage-femmes 1re année du / }).click();
      const dialogue = page.getByRole("dialog", { name: "Annulation impossible" });
      await expect(dialogue).toBeVisible();
      console.log(`DIALOGUE-BLOQUE-APRES-ANNULATION ${await dialogue.innerText()}`);
      await capture(page, DOSSIER, "UC10-06-06-toujours-impossible", dialogue);
    });
  });
});
