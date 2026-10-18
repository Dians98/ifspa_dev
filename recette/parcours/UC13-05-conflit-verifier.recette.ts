import {
  bandeau,
  boutonEncaisser,
  choisirEtudiant,
  ETUDIANTS,
  grandEcran,
  numeroDuTicket,
  ouvrirGuichetEnLigne,
  recharger,
  testPoste as test,
} from "./aides";
import { capture, expect, SESSIONS } from "./outils";

const DOSSIER = "UC13-hors-ligne";
const E = ETUDIANTS.lalaina;
const NOM = `${E.nom} ${E.prenoms}`;

test("UC13-05 : un autre poste a encaissé les mêmes mois pendant la coupure, l'administrateur vérifie", async ({ page, poste, browser }) => {
  test.setTimeout(180_000);
  const { baseURL } = test.info().project.use;

  let numeroHL = "";
  await test.step("1. Poste 1 : coupure, puis 180 000 Ar encaissés sans Internet", async () => {
    await ouvrirGuichetEnLigne(page);
    await poste.setOffline(true);
    await recharger(page, "Hors ligne · vous pouvez continuer à encaisser");
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*900\s000\sAr/)).toBeVisible();
    await page.getByRole("button", { name: /^Novembre 2025,/ }).click();
    await boutonEncaisser(page, 180_000).click();
    numeroHL = await numeroDuTicket(page);
    expect(numeroHL).toBe("R-2026-00006");
    await expect(bandeau(page)).toContainText("1 paiement en attente");
    await capture(page, DOSSIER, "UC13-05-01-poste1-ticket-hors-ligne");
  });

  let numeroEnLigne = "";
  await test.step("2. Poste 2, avec Internet : les mêmes mois sont encaissés entre-temps", async () => {
    const poste2 = await browser.newContext({ baseURL, storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });
    try {
      const guichet = await poste2.newPage();
      await guichet.addInitScript(() => {
        window.print = () => {};
      });
      await guichet.goto("/app/encaisser");
      await expect(bandeau(guichet)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
      await choisirEtudiant(guichet, E);
      await guichet.getByRole("button", { name: /^Novembre 2025,/ }).click();
      await boutonEncaisser(guichet, 180_000).click();
      const succes = guichet.getByRole("status").filter({ hasText: "Paiement enregistré" });
      await expect(succes).toBeVisible();
      numeroEnLigne = (await succes.textContent())?.match(/R-\d{4}-\d{5}/)?.[0] ?? "";
      expect(numeroEnLigne).toMatch(/^R-2026-\d{5}$/);
      expect(numeroEnLigne).not.toBe(numeroHL);
      await capture(guichet, DOSSIER, "UC13-05-02-poste2-en-ligne");
    } finally {
      await poste2.close();
    }
  });

  await test.step("3. Poste 1 : Internet revient, le paiement est enregistré mais signalé à vérifier", async () => {
    await poste.setOffline(false);
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
    await expect(bandeau(page)).toContainText("1 à vérifier par l'administrateur");
    await expect(bandeau(page)).toContainText(
      `Reçu ${numeroHL} enregistré, à vérifier par l'administrateur : Situation changée avant la synchronisation : le poste affichait 900 000 Ar de reste dû, le serveur 720 000 Ar.`
    );
    await capture(page, DOSSIER, "UC13-05-03-poste1-a-verifier", bandeau(page));
  });

  await test.step("4. Secrétariat : le reçu est marqué « À vérifier » mais il ne peut pas le traiter", async () => {
    await page.goto("/app/paiements");
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Les voir" }).click();
    const ligne = page.getByRole("row").filter({ hasText: numeroHL });
    await expect(ligne).toContainText("À vérifier");
    await expect(ligne).toContainText("Situation changée avant la synchronisation");
    await expect(page.getByRole("button", { name: /Marquer comme vérifié/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);
    await capture(page, DOSSIER, "UC13-05-04-secretariat-a-verifier");
  });

  const admin = await browser.newContext({ baseURL, storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });
  const pageAdmin = await admin.newPage();
  try {
    await test.step("5. Administrateur : ouvrir Paiements, filtre « À vérifier »", async () => {
      await pageAdmin.goto("/app/paiements");
      await expect(pageAdmin.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
      await pageAdmin.getByRole("link", { name: "Les voir" }).click();
      const ligne = pageAdmin.getByRole("row").filter({ hasText: numeroHL });
      await expect(ligne).toContainText("À vérifier");
      await expect(ligne.getByRole("button", { name: /Marquer comme vérifié/ })).toBeVisible();
      await expect(ligne.getByRole("button", { name: /^Annuler/ })).toBeVisible();
      await capture(pageAdmin, DOSSIER, "UC13-05-05-admin-a-verifier");
    });

    await test.step("6. Administrateur : lire la note puis « Marquer comme vérifié »", async () => {
      await pageAdmin.getByRole("row").filter({ hasText: numeroHL }).getByRole("button", { name: /Marquer comme vérifié/ }).click();
      const dialogue = pageAdmin.getByRole("dialog", { name: `Vérifier le reçu ${numeroHL}` });
      await expect(dialogue).toContainText("Ce paiement a été saisi hors ligne puis enregistré avec une remarque.");
      await expect(dialogue).toContainText("Situation changée avant la synchronisation");
      await capture(pageAdmin, DOSSIER, "UC13-05-06-admin-dialogue", dialogue);
      await dialogue.getByRole("button", { name: `Marquer le reçu ${numeroHL} comme vérifié` }).click();
      await expect(dialogue).toBeHidden();
    });

    await test.step("7. Administrateur : le reçu porte la mention « Vérifié le … par Administrateur IFSPA »", async () => {
      await pageAdmin.goto("/app/paiements");
      const ligne = pageAdmin.getByRole("row").filter({ hasText: numeroHL });
      await expect(ligne).toContainText(/Vérifié le \d{2}\/\d{2}\/\d{4} par Administrateur IFSPA/);
      await expect(ligne).not.toContainText("À vérifier");
      await expect(ligne).toContainText("Valide");
      await expect(pageAdmin.getByRole("link", { name: "Les voir" })).toHaveCount(0);
      await capture(pageAdmin, DOSSIER, "UC13-05-07-admin-verifie");
    });

    await test.step("8. Administrateur : « Numéros non utilisés » liste les numéros gardés par les postes", async () => {
      await grandEcran(pageAdmin, 1700);
      await pageAdmin.getByText(/^Numéros non utilisés/).click();
      await expect(pageAdmin.getByText(/numéros? encore détenus? par les postes/)).toBeVisible();
      await expect(pageAdmin.getByText("Hanitra RAKOTO").first()).toBeVisible();
      await capture(pageAdmin, DOSSIER, "UC13-05-08-admin-numeros-non-utilises");
    });

    await test.step("9. Administrateur : la fiche de l'étudiante, l'argent des deux postes est compté", async () => {
      await pageAdmin.goto("/app/paiements");
      await pageAdmin.getByRole("row").filter({ hasText: numeroHL }).getByRole("link", { name: NOM }).click();
      await expect(pageAdmin.getByRole("heading", { level: 1 })).toContainText(E.nom);
      await expect(pageAdmin.getByText(/540\s000\sAr/).first()).toBeVisible();
      await grandEcran(pageAdmin, 1600);
      await capture(pageAdmin, DOSSIER, "UC13-05-09-admin-fiche");
    });
  } finally {
    await admin.close();
  }

  await test.step("10. Le ticket remis hors ligne reste valable : même numéro au serveur", async () => {
    await page.goto("/app/paiements");
    const ligne = page.getByRole("row").filter({ hasText: numeroHL });
    await expect(ligne).toContainText(/180\s000\sAr/);
    await ligne.getByRole("link", { name: /Réimprimer/ }).click();
    const ticket = page.getByRole("article", { name: new RegExp(`^Reçu ${numeroHL}`) });
    await expect(ticket).toContainText(`N° ${numeroHL}`);
    await capture(page, DOSSIER, "UC13-05-10-recu-hors-ligne-au-serveur");
  });
});
