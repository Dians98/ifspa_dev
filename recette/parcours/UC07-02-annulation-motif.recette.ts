import { boutonEncaisser, carte, choisirEtudiant, ETUDIANTS, finImpression, grandEcran, montantRecu, testPoste as test, ticketImprime } from "./aides";
import { choisirFiltre, DOSSIER_UC07 as DOSSIER, ligne, ouvrirAdmin, ouvrirPaiements, RECUS, verifierNombre, verifierTotal, total } from "./aides-paiements";
import { capture, expect } from "./outils";

const E = ETUDIANTS.voahirana;
const NOM = `${E.nom} ${E.prenoms}`;
const MOTIF = "Erreur de saisie : reçu établi au mauvais nom";

test("UC07-02 : l'administrateur annule un reçu avec un motif, le reste dû de l'étudiante remonte", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { baseURL } = test.info().project.use;
  const { contexte, page: admin } = await ouvrirAdmin(browser, baseURL, 1500);

  try {
    await test.step("1. Avant : la fiche de VOAHIRANA, 260 000 Ar payés en deux reçus", async () => {
      await ouvrirPaiements(admin);
      await expect(admin.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
      await ligne(admin, RECUS.voahiranaOctobre).getByRole("link", { name: NOM }).click();
      await expect(admin.getByRole("heading", { level: 1 })).toContainText(E.nom);
      await expect(admin.getByText(/Reste à payer\s*640\s000\sAr/)).toBeVisible();
      await expect(admin.getByRole("tab", { name: "Paiements (2)" })).toBeVisible();
      await capture(admin, DOSSIER, "UC07-02-01-fiche-avant");
    });

    await test.step("2. Paiements : « Annuler » sur le reçu R-2026-00021 ouvre la fenêtre d'annulation", async () => {
      await ouvrirPaiements(admin);
      await ligne(admin, RECUS.voahiranaOctobre).getByRole("button", { name: `Annuler le reçu ${RECUS.voahiranaOctobre}` }).click();
      const dialogue = admin.getByRole("dialog", { name: `Annuler le reçu ${RECUS.voahiranaOctobre}` });
      await expect(dialogue).toContainText("À utiliser pour une erreur de saisie, un doublon ou un paiement rejeté.");
      await expect(dialogue).toContainText(`${RECUS.voahiranaOctobre} du`);
      await expect(dialogue).toContainText(`${NOM} ${E.matricule}`);
      await expect(dialogue).toContainText(/180\s000\sAr · Espèces/);
      await expect(dialogue).toContainText("Le reçu reste dans l'historique, marqué ANNULÉ. Les échéances qu'il payait redeviennent dues. L'annulation est enregistrée à votre nom.");
      await expect(dialogue.getByLabel("Motif de l'annulation")).toHaveValue("");
      await capture(admin, DOSSIER, "UC07-02-02-fenetre", dialogue);
    });

    await test.step("3. Saisir le motif et annuler le reçu", async () => {
      const dialogue = admin.getByRole("dialog", { name: `Annuler le reçu ${RECUS.voahiranaOctobre}` });
      await dialogue.getByLabel("Motif de l'annulation").fill(MOTIF);
      await dialogue.getByRole("button", { name: `Annuler le reçu ${RECUS.voahiranaOctobre}` }).click();
      await expect(dialogue).toBeHidden();
      await expect(admin.getByText(`Reçu ${RECUS.voahiranaOctobre} annulé : les échéances qu'il payait sont de nouveau dues.`)).toBeVisible();
      await capture(admin, DOSSIER, "UC07-02-03-confirmation");
    });

    await test.step("4. La liste : le reçu reste, marqué « Annulé », avec le motif, et sort des totaux", async () => {
      const l = ligne(admin, RECUS.voahiranaOctobre);
      await expect(l).toContainText("Annulé");
      await expect(l).toContainText(`${MOTIF} — par Administrateur IFSPA le`);
      await expect(l.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);
      await expect(l.getByRole("link", { name: /Réimprimer/ })).toBeVisible();
      await expect(admin.getByText(`Reçu ${RECUS.voahiranaOctobre} annulé :`)).toBeHidden({ timeout: 10_000 });
      await expect(total(admin, "Reçus")).toContainText("3");
      await expect(total(admin, "Reçus")).toContainText("+ 1 annulé");
      await verifierTotal(admin, "Total encaissé", 360_000);
      await verifierTotal(admin, "dont espèces", 80_000);
      await verifierTotal(admin, "dont Mobile Money", 280_000);
      await expect(admin.getByText("Reçus 1 à 4 sur 4")).toBeVisible();
      await grandEcran(admin, 1300);
      await capture(admin, DOSSIER, "UC07-02-04-liste-apres");
    });

    await test.step("5. Statut « Annulés seulement » : le reçu annulé reste dans l'historique", async () => {
      await choisirFiltre(admin, "Statut", "Annulés seulement");
      await verifierNombre(admin, 1);
      await expect(ligne(admin, RECUS.voahiranaOctobre)).toContainText("Annulé");
      await capture(admin, DOSSIER, "UC07-02-05-filtre-annules");
      await choisirFiltre(admin, "Statut", "Valides seulement");
      await verifierNombre(admin, 3);
      await expect(ligne(admin, RECUS.voahiranaOctobre)).toHaveCount(0);
    });

    await test.step("6. Réimprimer le reçu annulé : « *** ANNULÉ *** » sur le ticket", async () => {
      await ouvrirPaiements(admin);
      await ligne(admin, RECUS.voahiranaOctobre).getByRole("link", { name: /Réimprimer/ }).click();
      await expect(admin.getByText("Ce reçu a été annulé")).toBeVisible();
      await expect(admin.getByText(new RegExp(`Annulé le \\d{2}/\\d{2}/\\d{4} par Administrateur IFSPA\\. Motif : ${MOTIF}\\. Toute réimpression porte la mention ANNULÉ\\.`))).toBeVisible();
      await grandEcran(admin, 1700);
      await capture(admin, DOSSIER, "UC07-02-06-reimpression-apercu");
      const ticket = await ticketImprime(admin, RECUS.voahiranaOctobre);
      await expect(ticket).toContainText("*** ANNULÉ ***");
      await expect(ticket).toContainText("Sans valeur de paiement");
      await expect(ticket).toContainText("Annulé le");
      await expect(ticket).toContainText("Par Administrateur IFSPA");
      await expect(ticket).toContainText(`Motif : ${MOTIF}`);
      await expect(ticket).toContainText("RAKOTOMALALA Voahirana");
      await expect(ticket).toContainText(/Reste à payer\s*720\s000\sAr/);
      await capture(admin, DOSSIER, "UC07-02-06-reimpression-ticket-annule", ticket);
      await finImpression(admin);
    });

    await test.step("7. Réimprimer l'autre reçu de l'étudiante : il n'est pas touché", async () => {
      await ouvrirPaiements(admin);
      await ligne(admin, RECUS.voahiranaNovembre).getByRole("link", { name: /Réimprimer/ }).click();
      await expect(admin.getByText("Ce reçu a été annulé")).toHaveCount(0);
      const ticket = await ticketImprime(admin, RECUS.voahiranaNovembre);
      await expect(ticket).not.toContainText("ANNULÉ");
      await expect(ticket).toContainText("Novembre 2025");
      await expect(ticket).toContainText(/Reste à payer\s*640\s000\sAr/);
      await capture(admin, DOSSIER, "UC07-02-07-autre-recu-intact", ticket);
      await finImpression(admin);
    });

    await test.step("8. La fiche : le reste dû remonte à 820 000 Ar, le reçu annulé figure dans les paiements", async () => {
      await ouvrirPaiements(admin);
      await ligne(admin, RECUS.voahiranaOctobre).getByRole("link", { name: NOM }).click();
      await expect(admin.getByRole("heading", { level: 1 })).toContainText(E.nom);
      await expect(admin.getByText(/Reste à payer\s*820\s000\sAr/)).toBeVisible();
      await expect(admin.getByText(/Déjà payé\s*80\s000\sAr/)).toBeVisible();
      await capture(admin, DOSSIER, "UC07-02-08-fiche-apres");
      await admin.getByRole("tab", { name: "Paiements (2)" }).click();
      const l = ligne(admin, RECUS.voahiranaOctobre);
      await expect(l).toContainText("Annulé");
      await expect(l).toContainText(MOTIF);
      await capture(admin, DOSSIER, "UC07-02-08-fiche-paiements");
    });
  } finally {
    await contexte.close();
  }

  await test.step("9. Au guichet (secrétariat) : les droits et octobre 2025 sont de nouveau à payer, cochés d'office", async () => {
    await page.goto("/app/encaisser");
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*820\s000\sAr, dont 820\s000\sAr en retard/)).toBeVisible();
    await expect(carte(page, "Droits d'inscription")).toHaveAttribute("aria-pressed", "true");
    await expect(carte(page, "Octobre 2025")).toHaveAttribute("aria-pressed", "true");
    await expect(carte(page, "Novembre 2025")).toHaveCount(0);
    await expect(montantRecu(page)).toHaveValue(/^820\s000$/);
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC07-02-09-guichet");
    await expect(boutonEncaisser(page, 820_000)).toBeEnabled();
  });
});
