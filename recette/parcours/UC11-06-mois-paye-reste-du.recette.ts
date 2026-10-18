import { boutonEncaisser, choisirEtudiant, montantRecu, montantRegex, recuEnregistre } from "./aides";
import { ouvrirAdmin } from "./aides-paiements";
import { boutonSortie, cartesAnnee, dialogueSortie, DOSSIER_UC11 as DOSSIER, dontEnRetard, ETUDIANTS, ouvrirFicheDe, resteAPayer } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });

const { lalaina } = ETUDIANTS;
const TITRE = "Écolage 2025-2026 · 1re année";

// Le secrétariat encaisse, l'administrateur enregistre la sortie dans une autre fenêtre.
test("UC11-06 : un mois payé après la date de sortie reste dû, un acompte garde son mois", async ({ page, browser }) => {
  test.setTimeout(150_000);

  await test.step("1. Secrétariat : RABEMANANJARA Lalaina verse 450 000 Ar (droits, octobre à janvier, 30 000 Ar sur février)", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, lalaina);
    await montantRecu(page).fill("450000");
    await boutonEncaisser(page, 450_000).click();
    const r = await recuEnregistre(page);
    await expect(r.zone).toContainText(/450\s000\sAr · Espèces · RABEMANANJARA Lalaina\. Reste à payer : 450\s000\sAr\./);
    await capture(page, DOSSIER, "UC11-06-01-encaissement");
  });

  await test.step("2. Sa fiche : février 2026 est « En retard » avec 30 000 Ar payés, 450 000 Ar restent à payer", async () => {
    await ouvrirFicheDe(page, lalaina.nom, lalaina.matricule);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(montantRegex(450_000));
    const fevrier = cartesAnnee(page, TITRE).filter({ hasText: "Février 2026" });
    await expect(fevrier).toContainText("En retard");
    await expect(fevrier).toContainText(/Payé\s*30\s000\sAr/);
    await expect(fevrier).toContainText(/Reste\s*50\s000\sAr/);
    await capture(page, DOSSIER, "UC11-06-02-avant-sortie");
  });

  await test.step("3. Administrateur : abandon daté du 31/12/2025 : 5 échéances (mars à juillet 2026) ne sont plus dues", async () => {
    const { contexte, page: admin } = await ouvrirAdmin(browser, test.info().project.use.baseURL, 1300);
    try {
      await ouvrirFicheDe(admin, lalaina.nom, lalaina.matricule);
      await expect(admin.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
      await boutonSortie(admin).click();
      const dialogue = dialogueSortie(admin);
      await expect(dialogue).toContainText(/ce qui est en retard reste dû \(450\s000\sAr\)\./);
      await dialogue.getByLabel("Date de sortie").fill("2025-12-31");
      await dialogue.getByLabel("Motif").fill("Reprend ses études dans une autre ville");
      await capture(admin, DOSSIER, "UC11-06-03-fenetre", dialogue);
      await dialogue.getByRole("button", { name: "Enregistrer l'abandon" }).click();
      await expect(admin.getByText("Abandon enregistré : 5 échéances des mois suivants ne sont plus dues.")).toBeVisible();
      await expect(dialogue).toBeHidden();
    } finally {
      await contexte.close();
    }
  });

  await test.step("4. Secrétariat : reste à payer 50 000 Ar (février), janvier payé, février en acompte, 5 mois « Non due (sortie) »", async () => {
    await page.reload();
    await expect(page.getByText("Sorti · Abandon le 31/12/2025")).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(montantRegex(50_000));
    await expect(dontEnRetard(page)).toContainText(montantRegex(50_000));
    await expect(page.getByText("1 mois impayé", { exact: true })).toBeVisible();
    await expect(page.getByText("5 échéances non dues après la sortie, hors des totaux.")).toBeVisible();
    const cartes = cartesAnnee(page, TITRE);
    await expect(cartes.filter({ hasText: "Non due (sortie)" })).toHaveCount(5);
    await expect(cartes.filter({ hasText: "Janvier 2026" })).toContainText("Payé");
    await expect(cartes.filter({ hasText: "Janvier 2026" })).not.toContainText("Non due (sortie)");
    await expect(cartes.filter({ hasText: "Février 2026" })).toContainText("En retard");
    await expect(cartes.filter({ hasText: "Février 2026" })).toContainText(/Reste\s*50\s000\sAr/);
    for (const mois of ["Mars 2026", "Avril 2026", "Mai 2026", "Juin 2026", "Juillet 2026"]) {
      await expect(cartes.filter({ hasText: mois })).toContainText("Non due (sortie)");
    }
    await expect(page.getByRole("link", { name: /^Encaisser 50\s000\sAr$/ })).toBeVisible();
    await capture(page, DOSSIER, "UC11-06-04-fiche-apres-sortie");
  });
});
