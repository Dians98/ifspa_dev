import { montantRegex } from "./aides";
import { choisirClasse, ligneEtudiant, ouvrirAdmissions } from "./aides-admissions";
import { lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { boutonSortie, dialogueSortie, DOSSIER_UC11 as DOSSIER, ETUDIANTS, ouvrirFicheDe } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1500 } });

const { solofo } = ETUDIANTS;
const NOM = `${solofo.nom} ${solofo.prenoms}`;

// Après UC11-05 et UC11-06 (Mialy et Lalaina sont déjà sorties) : quatre étudiants IF doivent encore 2025-2026, ils sont en retard.
test("UC11-08 : un étudiant qui abandonne disparaît des Impayés et du passage en année supérieure", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Administrateur : Impayés compte 4 étudiants (3 600 000 Ar), RANDRIAMAHEFA Solofo est dans la liste", async () => {
    await ouvrirImpayes(page);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await verifierSynthese(page, 4, 3_600_000);
    await expect(lignesImpayes(page).filter({ hasText: solofo.nom })).toHaveCount(1);
    await capture(page, DOSSIER, "UC11-08-01-impayes-avant");
  });

  await test.step("2. Passage en année supérieure : la classe Infirmier(e)s 1re année compte 4 étudiants dont Solofo", async () => {
    await ouvrirAdmissions(page);
    await choisirClasse(page, "Infirmier(e)s", "1re année");
    await expect(page.getByText("4 étudiants · passage en 2e année pour 2026-2027")).toBeVisible();
    await expect(ligneEtudiant(page, NOM)).toBeVisible();
    await capture(page, DOSSIER, "UC11-08-02-passage-avant");
  });

  await test.step("3. Enregistrer l'abandon de Solofo (date du jour) : toutes ses échéances restent dues", async () => {
    await ouvrirFicheDe(page, solofo.nom, solofo.matricule);
    await boutonSortie(page).click();
    const dialogue = dialogueSortie(page);
    await dialogue.getByLabel("Motif").fill("Ne reprend pas les cours, raison de santé");
    await dialogue.getByRole("button", { name: "Enregistrer l'abandon" }).click();
    await expect(page.getByText("Abandon enregistré : toutes ses échéances restent dues.")).toBeVisible();
    await expect(page.getByText(/Sorti · Abandon le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(page.getByText("Reste à payer").locator("xpath=following-sibling::dd[1]")).toHaveText(montantRegex(900_000));
    await capture(page, DOSSIER, "UC11-08-03-fiche-sortie");
  });

  await test.step("4. Impayés ne compte plus que 3 étudiants (2 700 000 Ar) : Solofo n'y est plus", async () => {
    await ouvrirImpayes(page);
    await verifierSynthese(page, 3, 2_700_000);
    await expect(lignesImpayes(page)).toHaveCount(3);
    await expect(page.getByText(solofo.nom)).toHaveCount(0);
    await capture(page, DOSSIER, "UC11-08-04-impayes-apres");
  });

  await test.step("5. La classe Infirmier(e)s 1re année ne compte plus que 3 étudiants : Solofo n'est plus proposé au passage", async () => {
    await ouvrirAdmissions(page);
    await choisirClasse(page, "Infirmier(e)s", "1re année");
    await expect(page.getByText("3 étudiants · passage en 2e année pour 2026-2027")).toBeVisible();
    await expect(ligneEtudiant(page, NOM)).toHaveCount(0);
    await capture(page, DOSSIER, "UC11-08-05-passage-apres");
  });
});
