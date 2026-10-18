import { analyser, deposer, fichier, ouvrirReprise } from "./aides-reprise";
import { choisirFiltre, DOSSIER_UC07 as DOSSIER, ligne, ouvrirAdmin, ouvrirPaiements, rechercher, total, verifierNombre, verifierTotal } from "./aides-paiements";
import { capture, expect, SESSIONS, test } from "./outils";

// Base fraîche avec la section E seule (00c-preparation-reprise), puis l'import d'UC15-01 fait en préambule.
test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });

const RECUS = { randrianasolo: "R-2026-00002", randrianasolo2: "R-2026-00007", razanakolona: "R-2026-00003", rakotondrazafy: "R-2026-00001" };

test("UC07-06 : le n° du reçu papier d'un paiement repris se lit et se cherche dans Paiements", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { baseURL } = test.info().project.use;
  const { contexte, page: admin } = await ouvrirAdmin(browser, baseURL, 1300);

  try {
    await test.step("0. Préambule : l'administrateur importe le classeur de reprise (UC15-01, étapes 1 à 7)", async () => {
      await ouvrirReprise(admin);
      await deposer(admin, [fichier("reprise-ifspa-2026-2027.xlsx")]);
      await analyser(admin);
      await admin.getByRole("button", { name: "Importer 6 étudiants et 7 paiements" }).click();
      await admin.getByRole("alertdialog").getByRole("button", { name: "Importer maintenant" }).click();
      await expect(admin.getByRole("main").getByText(/^Import terminé : 6 étudiants créés, 7 paiements enregistrés pour 687\s000\sAr \(reçus R-2026-00001 à R-2026-00007\)\.$/)).toBeVisible({ timeout: 30_000 });
    });

    await test.step("1. Administrateur : Paiements d'octobre, chaque reçu repris affiche son n° de reçu papier", async () => {
      await ouvrirPaiements(admin);
      await expect(admin.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
      await choisirFiltre(admin, "Type de période", "Un mois");
      await expect(admin.getByText("Octobre 2026", { exact: true })).toBeVisible();
      await verifierNombre(admin, 7);
      await verifierTotal(admin, "Total encaissé", 687_000);
      await expect(ligne(admin, RECUS.randrianasolo)).toContainText("Reprise des données · reçu papier n° 0412");
      await expect(ligne(admin, RECUS.randrianasolo2)).toContainText("Reprise des données · reçu papier n° 0430");
      await expect(ligne(admin, RECUS.razanakolona)).toContainText("Reprise des données · reçu papier n° 0420");
      await expect(ligne(admin, RECUS.rakotondrazafy)).toContainText("Reprise des données · reçu papier n° 0398");
      await capture(admin, DOSSIER, "UC07-06-01-liste-octobre");
    });

    await test.step("2. Retrouver un paiement par le n° de son reçu papier : « 0412 »", async () => {
      await rechercher(admin, "0412");
      await verifierNombre(admin, 1);
      const l = ligne(admin, RECUS.randrianasolo);
      await expect(l).toContainText("RANDRIANASOLO Haingo Mirana");
      await expect(l).toContainText("IF-2026-0001");
      await expect(l).toContainText(/114\s000\sAr/);
      await expect(l).toContainText("Espèces");
      await expect(l).toContainText("Administrateur IFSPA");
      await expect(l).toContainText("05/10/2026");
      await verifierTotal(admin, "Total encaissé", 114_000);
      await capture(admin, DOSSIER, "UC07-06-02-recherche-0412");
    });

    await test.step("3. Un autre n° : « 0420 » trouve le paiement MVola de RAZANAKOLONA", async () => {
      await rechercher(admin, "0420");
      await verifierNombre(admin, 1);
      await expect(ligne(admin, RECUS.razanakolona)).toContainText("Mobile Money · MVola");
      await expect(ligne(admin, RECUS.razanakolona)).toContainText("MP261008.1432.A1");
      await expect(ligne(admin, RECUS.razanakolona)).toContainText("reçu papier n° 0420");
      await capture(admin, DOSSIER, "UC07-06-03-recherche-0420");
    });

    await test.step("4. Chercher « papier » ramène tous les paiements repris, un n° inconnu aucun", async () => {
      await rechercher(admin, "papier");
      await verifierNombre(admin, 7);
      await capture(admin, DOSSIER, "UC07-06-04-recherche-papier");
      await rechercher(admin, "9999");
      await expect(admin.getByText(/^Aucun paiement ne correspond à ces filtres\./)).toBeVisible();
      await capture(admin, DOSSIER, "UC07-06-04-recherche-sans-resultat");
    });

    await test.step("5. Secrétariat : la même ligne, avec le même n° de reçu papier", async () => {
      await page.goto("/app/paiements?periode=mois&q=0412");
      await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
      await verifierNombre(page, 1);
      await expect(ligne(page, RECUS.randrianasolo)).toContainText("Reprise des données · reçu papier n° 0412");
      await expect(page.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);
      await expect(total(page, "Reçus")).toHaveText("1");
      await capture(page, DOSSIER, "UC07-06-05-secretariat-0412");
    });

    await test.step("6. La fiche de RANDRIANASOLO : onglet Paiements, les deux reçus portent leur n° de reçu papier", async () => {
      await ligne(page, RECUS.randrianasolo).getByRole("link", { name: "RANDRIANASOLO Haingo Mirana" }).click();
      await page.getByRole("tab", { name: "Paiements (2)" }).click();
      await expect(ligne(page, RECUS.randrianasolo)).toContainText("reçu papier n° 0412");
      await expect(ligne(page, RECUS.randrianasolo2)).toContainText("reçu papier n° 0430");
      await capture(page, DOSSIER, "UC07-06-06-fiche-paiements");
    });

    await test.step("7. Le ticket réimprimé ne porte pas le n° du reçu papier (décision provisoire n° 62)", async () => {
      await page.getByRole("link", { name: `Réimprimer le reçu ${RECUS.randrianasolo}` }).click();
      const ticket = page.getByRole("article", { name: new RegExp(`^Reçu ${RECUS.randrianasolo}`) });
      await expect(ticket).toContainText(`N° ${RECUS.randrianasolo}`);
      await expect(ticket).not.toContainText("papier");
      await expect(ticket).not.toContainText("0412");
      await capture(page, DOSSIER, "UC07-06-07-ticket-sans-recu-papier", ticket);
    });
  } finally {
    await contexte.close();
  }
});
