import fs from "node:fs";
import path from "node:path";
import { montantRegex } from "./aides";
import { B, DOSSIER, ouvrirFiche } from "./aides-az";
import { carte, derniers, ouvrirDashboard, tableau } from "./aides-dashboard";
import { dossierCaptures, dossierTemporaire, lireClasseur, lireReleve, ouvrirImpayes, pdfEnPng, telechargerReleve, ligneEtudiant, verifierSynthese } from "./aides-impayes";
import { ligne, ouvrirPaiements, total, verifierNombre, verifierTotal } from "./aides-paiements";
import { capture, expect, SESSIONS, test } from "./outils";

// Acte 4 : le secrétariat consulte les paiements du jour sans pouvoir annuler ; l'administrateur annule l'erreur, puis contrôle impayés, relevé et tableau de bord.
test.describe.configure({ mode: "serial" });

const RECU_ERREUR = "R-2026-00024";
const MOTIF = "Reçu établi au mauvais nom : l'argent n'était pas pour cet étudiant";

test.describe("Acte 4 : secrétariat", () => {
  test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1100 } });

  test("4.1 le secrétariat voit les quatre reçus, sans bouton Annuler", async ({ page }) => {
    await ouvrirPaiements(page);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await verifierNombre(page, 4);
    await verifierTotal(page, "Total encaissé", 1_360_000);
    await verifierTotal(page, "dont espèces", 1_060_000);
    await verifierTotal(page, "dont Mobile Money", 300_000);
    await expect(page.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Réimprimer/ })).toHaveCount(4);
    await capture(page, DOSSIER, "AZ-4-1-paiements-secretariat");
  });
});

test.describe("Acte 4 : administrateur", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

  test("4.2 à 4.7 l'administrateur annule le reçu erroné puis contrôle", async ({ page }) => {
    test.setTimeout(150_000);
    const dossier = dossierTemporaire("az-4");

    await test.step("4.2 Paiements : « Annuler » sur le reçu R-2026-00024", async () => {
      await ouvrirPaiements(page);
      await expect(page.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
      await ligne(page, RECU_ERREUR).getByRole("button", { name: `Annuler le reçu ${RECU_ERREUR}` }).click();
      const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${RECU_ERREUR}` });
      await expect(dialogue).toContainText(/60\s000\sAr · Espèces/);
      await dialogue.getByLabel("Motif de l'annulation").fill(MOTIF);
      await capture(page, DOSSIER, "AZ-4-2-annuler-fenetre", dialogue);
    });

    await test.step("4.3 Confirmer : le reçu reste, marqué « Annulé », et sort des totaux", async () => {
      const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${RECU_ERREUR}` });
      await dialogue.getByRole("button", { name: `Annuler le reçu ${RECU_ERREUR}` }).click();
      await expect(dialogue).toBeHidden();
      await expect(page.getByText(`Reçu ${RECU_ERREUR} annulé : les échéances qu'il payait sont de nouveau dues.`)).toBeVisible();
      await expect(ligne(page, RECU_ERREUR)).toContainText("Annulé");
      await expect(total(page, "Reçus")).toContainText("+ 1 annulé");
      await verifierTotal(page, "Total encaissé", 1_300_000);
      await capture(page, DOSSIER, "AZ-4-3-recu-annule");
    });

    await test.step("4.4 Impayés : B, C et D, pas A", async () => {
      await ouvrirImpayes(page);
      await expect(ligneEtudiant(page, "RASOANAIVO")).toBeVisible();
      await expect(ligneEtudiant(page, "RAZAFINDRAKOTO")).toBeVisible();
      await expect(ligneEtudiant(page, "ANDRIANARISOA")).toBeVisible();
      await expect(page.getByRole("region", { name: "Liste des étudiants en retard" }).getByText("RAKOTOMALALA")).toHaveCount(0);
      await verifierSynthese(page, 3, 2_420_000);
      await expect(ligneEtudiant(page, "RASOANAIVO")).toContainText("8 mois");
      await expect(ligneEtudiant(page, "RASOANAIVO")).toContainText(montantRegex(600_000));
      await expect(ligneEtudiant(page, "RAZAFINDRAKOTO")).toContainText(montantRegex(1_020_000));
      await expect(ligneEtudiant(page, "ANDRIANARISOA")).toContainText(montantRegex(800_000));
      await capture(page, DOSSIER, "AZ-4-4-impayes");
    });

    await test.step("4.5 Exporter (Excel)", async () => {
      const [telechargement] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exporter (Excel)" }).click()]);
      const jour = new Date().toLocaleDateString("fr-CA", { timeZone: "Indian/Antananarivo" });
      expect(telechargement.suggestedFilename()).toBe(`impayes-${jour}.xlsx`);
      const fichier = path.join(dossier, telechargement.suggestedFilename());
      await telechargement.saveAs(fichier);
      const sortie = lireClasseur(fichier);
      const lignes = sortie.trim().split(/\r?\n/).slice(1).map((l) => l.split(" | "));
      expect(lignes).toHaveLength(4);
      const corps = lignes.map((l, i) => `<tr>${l.map((c) => `<${i === 0 ? "th" : "td"}>${c}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`).join("");
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{font:13px Calibri,Arial,sans-serif;margin:16px}h1{font-size:14px;margin:0 0 8px}
        table{border-collapse:collapse}th,td{border:1px solid #bbb;padding:3px 8px;white-space:nowrap}th{background:#e8e8e8}</style>
        <div id="apercu" style="display:inline-block"><h1>Contenu du fichier ${telechargement.suggestedFilename()}, feuille « Impayés »</h1><table>${corps}</table></div>`);
      await capture(page, DOSSIER, "AZ-4-5-export-excel", page.locator("#apercu"));
    });

    await test.step("4.6 Relevé d'écolage de B en PDF A4", async () => {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await ouvrirFiche(page, B);
      const { fichier, nom } = await telechargerReleve(page, dossier);
      expect(nom).toBe("releve-IF-2025-0002.pdf");
      const releve = lireReleve(fichier);
      expect(releve.format).toBe("595 842");
      expect(releve.pages).toBe(1);
      expect(releve.texte).toContain("RELEVÉ D'ÉCOLAGE");
      pdfEnPng(fichier, 1, path.join(dossierCaptures(DOSSIER), "AZ-4-6-releve-b.png"));
      fs.rmSync(fichier, { force: true });
    });

    await test.step("4.7 Tableau de bord", async () => {
      await page.setViewportSize({ width: 1440, height: 1500 });
      await ouvrirDashboard(page);
      await expect(carte(page, "Effectif actif")).toContainText("4");
      await expect(carte(page, "Taux de recouvrement")).toContainText("34,9 %");
      await expect(carte(page, "Taux de recouvrement")).toContainText(/1\s300\s000\sAr encaissés sur 3\s720\s000\sAr attendus à date/);
      await expect(carte(page, "Étudiants en retard")).toContainText(/3\s+sur 4/);
      await expect(tableau(page)).toContainText("Sous-total Infirmier(e)s");
      await expect(derniers(page)).toContainText("R-2026-00021");
      await capture(page, DOSSIER, "AZ-4-7-tableau-de-bord");
    });
  });
});
