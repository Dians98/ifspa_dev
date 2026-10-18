import {
  bandeau,
  boutonEncaisser,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  grandEcran,
  numeroDuTicket,
  ouvrirGuichetEnLigne,
  recharger,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { DOSSIER_UC07 as DOSSIER, ligne, ouvrirAdmin, ouvrirPaiements, total, verifierNombre } from "./aides-paiements";
import { capture, expect, SESSIONS } from "./outils";

const A = ETUDIANTS.mialy;
const B = ETUDIANTS.lalaina;
const NOM_A = `${A.nom} ${A.prenoms}`;
const NOM_B = `${B.nom} ${B.prenoms}`;
const MOTIF = "Doublon : le même mois a été encaissé par l'autre poste";

test("UC07-05 : deux reçus hors ligne arrivent « à vérifier », l'administrateur en vérifie un et annule l'autre", async ({ page, poste, browser }) => {
  test.setTimeout(240_000);
  const { baseURL } = test.info().project.use;
  const { contexte: contexteAdmin, page: admin } = await ouvrirAdmin(browser, baseURL, 1500);

  let recuA = "";
  let recuB = "";
  let noteA = "";

  try {
    await test.step("1. Poste 1 sans Internet : 180 000 Ar encaissés pour MIALY, puis 180 000 Ar pour LALAINA", async () => {
      await ouvrirGuichetEnLigne(page);
      await poste.setOffline(true);
      await recharger(page, "Hors ligne · vous pouvez continuer à encaisser");
      for (const [e, suite] of [[A, "A"], [B, "B"]] as const) {
        await choisirEtudiant(page, e);
        await expect(page.getByText(/Reste à payer :\s*900\s000\sAr/)).toBeVisible();
        await page.getByRole("button", { name: /^Novembre 2025,/ }).click();
        await boutonEncaisser(page, 180_000).click();
        const numero = await numeroDuTicket(page);
        if (suite === "A") {
          recuA = numero;
          const ticket = await ticketImprime(page, recuA);
          await expect(ticket).toContainText("Droits d'inscription");
          await expect(ticket).toContainText("Octobre 2025");
          await expect(ticket).toContainText(/Reste à payer\s*720\s000\sAr/);
          await capture(page, DOSSIER, "UC07-05-01-ticket-remis-hors-ligne", ticket);
          await finImpression(page);
        } else recuB = numero;
      }
      expect(recuA).toMatch(/^R-2026-\d{5}$/);
      expect(recuB).toMatch(/^R-2026-\d{5}$/);
      await expect(bandeau(page)).toContainText("2 paiements en attente");
    });

    await test.step("2. Poste 2, avec Internet : les mêmes mois sont encaissés entre-temps pour les deux étudiantes", async () => {
      const poste2 = await browser.newContext({ baseURL, storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });
      try {
        const guichet = await poste2.newPage();
        await guichet.addInitScript(() => {
          window.print = () => {};
        });
        await guichet.goto("/app/encaisser");
        await expect(bandeau(guichet)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
        for (const e of [A, B]) {
          await choisirEtudiant(guichet, e);
          await guichet.getByRole("button", { name: /^Novembre 2025,/ }).click();
          await boutonEncaisser(guichet, 180_000).click();
          await expect(guichet.getByRole("status").filter({ hasText: "Paiement enregistré" })).toBeVisible();
        }
      } finally {
        await poste2.close();
      }
    });

    await test.step("3. Poste 1 : Internet revient, les deux paiements sont enregistrés mais signalés à vérifier", async () => {
      await poste.setOffline(false);
      await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 30_000 });
      await expect(bandeau(page)).toContainText("2 paiements envoyés au serveur");
      await expect(bandeau(page)).toContainText("2 à vérifier par l'administrateur");
      await expect(bandeau(page)).toContainText(`Reçu ${recuA} enregistré, à vérifier par l'administrateur : Situation changée avant la synchronisation : le poste affichait 900 000 Ar de reste dû, le serveur 720 000 Ar.`);
      await capture(page, DOSSIER, "UC07-05-03-poste1-a-verifier", bandeau(page));
    });

    await test.step("4. Secrétariat : Paiements signale « À vérifier 2 », les notes sont lisibles, aucun bouton de traitement", async () => {
      await grandEcran(page, 1500);
      await ouvrirPaiements(page);
      await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
      await expect(total(page, "À vérifier")).toContainText("2");
      await expect(total(page, "À vérifier").getByRole("link", { name: "Les voir" })).toBeVisible();
      await page.getByRole("link", { name: "Les voir" }).click();
      await verifierNombre(page, 2);
      for (const numero of [recuA, recuB]) {
        const l = ligne(page, numero);
        await expect(l).toContainText("À vérifier");
        await expect(l).toContainText("Situation changée avant la synchronisation : le poste affichait 900 000 Ar de reste dû, le serveur 720 000 Ar.");
      }
      noteA = (await ligne(page, recuA).textContent()) ?? "";
      await expect(page.getByRole("button", { name: /Marquer comme vérifié/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);
      await capture(page, DOSSIER, "UC07-05-04-secretariat-a-verifier");
    });

    await test.step("5. Administrateur : le filtre « À vérifier » propose « Marquer comme vérifié » et « Annuler »", async () => {
      await ouvrirPaiements(admin);
      await expect(admin.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
      await expect(total(admin, "À vérifier")).toContainText("2");
      await admin.getByRole("link", { name: "Les voir" }).click();
      await verifierNombre(admin, 2);
      for (const numero of [recuA, recuB]) {
        const l = ligne(admin, numero);
        await expect(l.getByRole("button", { name: new RegExp(`^Marquer comme vérifié.*${numero}`) })).toBeVisible();
        await expect(l.getByRole("button", { name: new RegExp(`^Annuler.*${numero}`) })).toBeVisible();
      }
      await capture(admin, DOSSIER, "UC07-05-05-admin-a-verifier");
    });

    await test.step("6. Administrateur : lire la note, puis « Marquer comme vérifié » pour le reçu de MIALY", async () => {
      await ligne(admin, recuA).getByRole("button", { name: /Marquer comme vérifié/ }).click();
      const dialogue = admin.getByRole("dialog", { name: `Vérifier le reçu ${recuA}` });
      await expect(dialogue).toContainText("Ce paiement a été saisi hors ligne puis enregistré avec une remarque.");
      await expect(dialogue).toContainText("Situation changée avant la synchronisation");
      await expect(dialogue).toContainText(NOM_A);
      await capture(admin, DOSSIER, "UC07-05-06-admin-dialogue", dialogue);
      await dialogue.getByRole("button", { name: `Marquer le reçu ${recuA} comme vérifié` }).click();
      await expect(dialogue).toBeHidden();
    });

    await test.step("7. Le reçu vérifié porte « Vérifié le … par Administrateur IFSPA » et sort de la liste à vérifier", async () => {
      await ouvrirPaiements(admin);
      const l = ligne(admin, recuA);
      await expect(l).toContainText(/Vérifié le \d{2}\/\d{2}\/\d{4} par Administrateur IFSPA/);
      await expect(l).toContainText("Situation changée avant la synchronisation");
      await expect(l).toContainText("Valide");
      await expect(l).not.toContainText("À vérifier");
      await expect(l.getByRole("button", { name: /Marquer comme vérifié/ })).toHaveCount(0);
      await expect(total(admin, "À vérifier")).toContainText("1");
      await grandEcran(admin, 1800);
      await capture(admin, DOSSIER, "UC07-05-07-admin-verifie");
    });

    await test.step("8. Administrateur : annuler le reçu de LALAINA, qui fait doublon : il sort du filtre « À vérifier »", async () => {
      await admin.getByRole("link", { name: "Les voir" }).click();
      await verifierNombre(admin, 1);
      await ligne(admin, recuB).getByRole("button", { name: `Annuler le reçu ${recuB}` }).click();
      const dialogue = admin.getByRole("dialog", { name: `Annuler le reçu ${recuB}` });
      await expect(dialogue).toContainText(`${NOM_B} ${B.matricule}`);
      await dialogue.getByLabel("Motif de l'annulation").fill(MOTIF);
      await dialogue.getByRole("button", { name: `Annuler le reçu ${recuB}` }).click();
      await expect(dialogue).toBeHidden();
      await expect(admin.getByText("Aucun paiement ne correspond à ces filtres.")).toBeVisible();
      await expect(total(admin, "À vérifier")).toHaveCount(0);
      await expect(admin.getByRole("link", { name: "Les voir" })).toHaveCount(0);
      await capture(admin, DOSSIER, "UC07-05-08-annule-sort-du-filtre");
    });

    await test.step("9. Le reçu annulé reste dans « Annulés seulement », avec son motif", async () => {
      await admin.getByRole("combobox", { name: "Statut" }).click();
      await admin.getByRole("option", { name: "Annulés seulement" }).click();
      const l = ligne(admin, recuB);
      await expect(l).toContainText(`${MOTIF} — par Administrateur IFSPA le`);
      await expect(l).not.toContainText("À vérifier");
      await capture(admin, DOSSIER, "UC07-05-09-annule-dans-annules");
    });

    await test.step("10. La fiche de LALAINA : seul le reçu du poste 2 compte, 720 000 Ar restent à payer", async () => {
      await ligne(admin, recuB).getByRole("link", { name: NOM_B }).click();
      await expect(admin.getByRole("heading", { level: 1 })).toContainText(B.nom);
      await expect(admin.getByText(/Reste à payer\s*720\s000\sAr/)).toBeVisible();
      await capture(admin, DOSSIER, "UC07-05-10-fiche-lalaina");
    });

    await test.step("11. Réimprimer le reçu vérifié : même numéro que le ticket remis, répartition du serveur", async () => {
      await ouvrirPaiements(admin);
      await ligne(admin, recuA).getByRole("link", { name: /Réimprimer/ }).click();
      const ticket = await ticketImprime(admin, recuA);
      await expect(ticket).toContainText(`N° ${recuA}`);
      const texte = (await ticket.textContent()) ?? "";
      console.log(`REIMPRESSION-A ${recuA} ${texte.replace(/\s+/g, " ")}`);
      await capture(admin, DOSSIER, "UC07-05-11-reimpression-verifie", ticket);
      await finImpression(admin);
    });

    await test.step("12. « Numéros non utilisés » : les numéros des postes", async () => {
      await ouvrirPaiements(admin);
      await grandEcran(admin, 1800);
      await admin.getByText(/^Numéros non utilisés/).click();
      await expect(admin.getByText(/numéros? encore détenus? par les postes/)).toBeVisible();
      await capture(admin, DOSSIER, "UC07-05-12-numeros-non-utilises");
    });
  } finally {
    await contexteAdmin.close();
  }
  console.log(`NUMEROS-HL ${recuA} ${recuB} NOTE ${noteA.slice(0, 40)}`);
});
