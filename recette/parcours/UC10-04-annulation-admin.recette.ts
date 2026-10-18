import { boutonEncaisser, choisirEtudiant, montantRecu, recuEnregistre } from "./aides";
import {
  caseEtudiant,
  choisirClasse,
  DOSSIER_UC10 as DOSSIER,
  ETUDIANTS_IF as IF,
  ligneEtudiant,
  lienClasse,
  ouvrirAdmissions,
} from "./aides-admissions";
import { capture, expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });

async function fiche(page: import("@playwright/test").Page, nom: string) {
  await page.goto("/app/etudiants");
  await page.getByRole("link", { name: new RegExp(nom) }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nom);
}

test.describe("UC10-04 : le secrétariat encaisse sur l'année précédente", () => {
  test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1000 } });

  test("RASOANAIVO Fanja verse 100 000 Ar : ils vont sur 2025-2026", async ({ page }) => {
    await test.step("1. Encaisser 100 000 Ar pour Fanja (le paiement solde 2025-2026 d'abord)", async () => {
      await page.goto("/app/encaisser");
      await choisirEtudiant(page, { nom: "RASOANAIVO" });
      await montantRecu(page).fill("100000");
      await boutonEncaisser(page, 100_000).click();
      const { numero } = await recuEnregistre(page);
      console.log(`NUMERO-UC10-04 ${numero}`);
      await fiche(page, "RASOANAIVO Fanja");
      await expect(page.getByText(/1\s700\s000\sAr/).first()).toBeVisible();
      await expect(page.getByText(/Dû\s900\s000\sAr\s·\sPayé\s100\s000\sAr\s·\sReste\s800\s000\sAr/)).toBeVisible();
      await expect(page.getByText(/Dû\s900\s000\sAr\s·\sPayé\s0\sAr\s·\sReste\s900\s000\sAr/)).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 1800 });
      await capture(page, DOSSIER, "UC10-04-01-fanja-paye-2025");
    });
  });
});

test.describe("UC10-04 : l'administrateur annule le passage", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1000 } });

  test("annulation depuis la classe validée, état restauré", async ({ page }) => {
    test.setTimeout(120_000);

    await test.step("2. Classe validée : le bouton « Annuler ce passage » est visible de l'administrateur", async () => {
      await ouvrirAdmissions(page);
      await choisirClasse(page, "Infirmier(e)s", "1re année");
      await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
      await expect(page.getByText(/Classe validée le .+ par Hanitra RAKOTO/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Annuler ce passage" })).toBeVisible();
      await capture(page, DOSSIER, "UC10-04-02-classe-validee-admin");
    });

    await test.step("3. Annuler ce passage : la fenêtre dit ce qui sera restauré", async () => {
      await page.getByRole("button", { name: "Annuler ce passage" }).click();
      const dialogue = page.getByRole("dialog", { name: "Annuler ce passage ?" });
      await expect(dialogue).toContainText("Infirmier(e)s 1re année · 2025-2026 vers 2026-2027 · validé le");
      await expect(dialogue).toContainText("Aucun reçu n'existe sur ces nouvelles inscriptions : l'annulation est possible.");
      await expect(dialogue).toContainText("Les étudiants reviennent à leur état d'avant le passage :");
      await expect(dialogue).toContainText("4 inscriptions créées en 2026-2027, avec leurs mensualités, sont supprimées.");
      await expect(dialogue).toContainText("3 admis reprennent son inscription en cours en 1re année 2025-2026.");
      await expect(dialogue).toContainText("1 redoublant reprend son inscription en cours en 1re année 2025-2026.");
      await expect(dialogue).toContainText("La classe redevient « À faire ».");
      await capture(page, DOSSIER, "UC10-04-03-fenetre-annulation", dialogue);
    });

    await test.step("4. Confirmer : la classe redevient « À faire », tous les étudiants sont de nouveau cochés", async () => {
      const dialogue = page.getByRole("dialog", { name: "Annuler ce passage ?" });
      await dialogue.getByRole("button", { name: "Annuler le passage" }).click();
      await expect(dialogue).toBeHidden();
      await expect(page.getByText("Passage annulé : Infirmier(e)s 1re année est revenue à son état d'avant la validation.")).toBeVisible();
      await expect(page.getByText("0 classe validée sur 2")).toBeVisible();
      await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("À faire");
      await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("4 étudiants");
      for (const nom of Object.values(IF)) {
        await expect(caseEtudiant(page, nom)).toBeChecked();
        await expect(ligneEtudiant(page, nom)).toContainText("Passe en 2e année");
      }
      await capture(page, DOSSIER, "UC10-04-04-passage-annule");
    });

    await test.step("5. Historique : le passage est « Annulé », par l'administrateur", async () => {
      await page.getByRole("link", { name: "Historique" }).click();
      const ligne = page.getByRole("row").filter({ hasText: "Infirmier(e)s 1re année" });
      await expect(ligne).toContainText("Annulé");
      await expect(ligne).toContainText("par Administrateur IFSPA");
      await expect(ligne.getByRole("button", { name: /Annuler/ })).toHaveCount(0);
      await capture(page, DOSSIER, "UC10-04-05-historique-annule");
    });

    await test.step("6. Fiche de RAKOTOMALALA Voahirana : revenue en 1re année 2025-2026, une seule année à payer", async () => {
      await fiche(page, "RAKOTOMALALA Voahirana");
      await expect(page.getByText("IF-2025-0001", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("1re année · 2025-2026")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Écolage 2026-2027/ })).toHaveCount(0);
      await expect(page.getByText(/900\s000\sAr/).first()).toBeVisible();
      await expect(page.getByText(/1\s800\s000\sAr/)).toHaveCount(0);
      await page.setViewportSize({ width: 1440, height: 1800 });
      await capture(page, DOSSIER, "UC10-04-06-fiche-voahirana-restauree");
    });

    await test.step("7. Fiche de RANDRIAMAHEFA Solofo : plus redoublant ; parcours à une ligne", async () => {
      await page.setViewportSize({ width: 1440, height: 800 });
      await fiche(page, "RANDRIAMAHEFA Solofo");
      await expect(page.getByText("1re année · 2025-2026")).toBeVisible();
      await expect(page.getByText("Redoublant", { exact: true })).toHaveCount(0);
      await page.getByRole("tab", { name: /Parcours/ }).click();
      const parcours = page.getByRole("tabpanel");
      await expect(parcours).toContainText("2025-2026");
      await expect(parcours).toContainText("En cours");
      await expect(parcours).not.toContainText("2026-2027");
      await expect(parcours).not.toContainText("Redouble");
      await capture(page, DOSSIER, "UC10-04-07-parcours-solofo-restaure");
    });

    await test.step("8. Fiche de RASOANAIVO Fanja : son paiement de 100 000 Ar est intact (reste 800 000 Ar)", async () => {
      await fiche(page, "RASOANAIVO Fanja");
      await expect(page.getByText(/800\s000\sAr/).first()).toBeVisible();
      await expect(page.getByRole("tab", { name: "Paiements (1)" })).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 800 });
      await page.getByRole("tab", { name: "Paiements (1)" }).click();
      await expect(page.getByRole("tabpanel")).toContainText("Validé");
      await capture(page, DOSSIER, "UC10-04-08-fanja-paiement-intact");
    });
  });
});
