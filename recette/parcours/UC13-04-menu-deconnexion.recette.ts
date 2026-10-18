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
import { capture, expect } from "./outils";

const DOSSIER = "UC13-hors-ligne";
const E = ETUDIANTS.mialy;
const DECONNEXION = "Se déconnecter";
const SANS_INTERNET = "Déconnexion impossible hors ligne : reconnectez-vous à Internet.";
const AVEC_PAIEMENT = "Déconnexion impossible : 1 paiement à envoyer. Ouvrez Encaisser et attendez la fin de la synchronisation.";

test("UC13-04 : menu grisé et déconnexion bloquée tant que le poste est coupé ou qu'un paiement attend", async ({ page, poste }) => {
  test.setTimeout(150_000);

  await test.step("1. Avec Internet : tout le menu est actif, la déconnexion est possible", async () => {
    await ouvrirGuichetEnLigne(page);
    await expect(page.getByRole("link", { name: "Étudiants" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Paiements" })).toBeVisible();
    await expect(page.getByRole("button", { name: DECONNEXION })).not.toHaveAttribute("aria-disabled", "true");
    await capture(page, DOSSIER, "UC13-04-01-en-ligne");
  });

  await test.step("2. Sans Internet : les autres entrées sont grisées « Connexion nécessaire »", async () => {
    await poste.setOffline(true);
    await recharger(page, "Hors ligne · vous pouvez continuer à encaisser");
    for (const entree of ["Tableau de bord", "Étudiants", "Passage en année supérieure", "Paiements", "Impayés"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${entree} Connexion nécessaire$`) })).toHaveAttribute("aria-disabled", "true");
    }
    await expect(page.getByRole("link", { name: /Encaisser/ }).first()).toBeVisible();
    await capture(page, DOSSIER, "UC13-04-02-menu-grise");
  });

  await test.step("3. Cliquer sur une entrée grisée ne fait rien", async () => {
    await page.getByRole("button", { name: /^Étudiants Connexion nécessaire$/ }).click({ force: true });
    await expect(page).toHaveURL(/\/app\/encaisser$/);
    await expect(bandeau(page)).toContainText("Hors ligne · vous pouvez continuer à encaisser");
    await capture(page, DOSSIER, "UC13-04-03-clic-sans-effet");
  });

  await test.step("4. La déconnexion est refusée sans Internet, avec sa raison", async () => {
    const bouton = page.getByRole("button", { name: DECONNEXION });
    await expect(bouton).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText(SANS_INTERNET)).toBeVisible();
    await bouton.click({ force: true });
    await expect(page).toHaveURL(/\/app\/encaisser$/);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC13-04-04-deconnexion-refusee-hors-ligne");
  });

  let numero = "";
  await test.step("5. Encaisser 180 000 Ar sans Internet", async () => {
    await choisirEtudiant(page, E);
    await page.getByRole("button", { name: /^Novembre 2025,/ }).click();
    await boutonEncaisser(page, 180_000).click();
    numero = await numeroDuTicket(page);
    expect(numero).toBe("R-2026-00005");
    await expect(bandeau(page)).toContainText("1 paiement en attente");
  });

  await test.step("6. Internet revient mais le serveur répond une erreur : le paiement reste à envoyer et bloque la déconnexion", async () => {
    // Panne côté serveur simulée sur l'adresse de synchronisation (F12 > Réseau > Bloquer l'URL de la requête).
    await page.route("**/api/encaissement/synchroniser", (route) => route.fulfill({ status: 500, body: "" }));
    await poste.setOffline(false);
    await expect(bandeau(page)).toContainText("Synchronisation impossible pour le moment", { timeout: 20_000 });
    await expect(bandeau(page)).toContainText("Le serveur a répondu 500.");
    await expect(page.getByText(AVEC_PAIEMENT)).toBeVisible();
    await expect(page.getByRole("button", { name: DECONNEXION })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: DECONNEXION }).click({ force: true });
    await expect(page).toHaveURL(/\/app\/encaisser$/);
    await capture(page, DOSSIER, "UC13-04-06-deconnexion-refusee-paiement");
  });

  await test.step("7. Le serveur répond de nouveau : « Synchroniser » envoie le paiement, la déconnexion est possible", async () => {
    await page.unroute("**/api/encaissement/synchroniser");
    await page.getByRole("button", { name: "Synchroniser" }).click();
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
    await expect(page.getByText(AVEC_PAIEMENT)).toHaveCount(0);
    await expect(page.getByRole("button", { name: DECONNEXION })).not.toHaveAttribute("aria-disabled", "true");
    await grandEcran(page, 1000);
    await capture(page, DOSSIER, "UC13-04-07-deconnexion-possible");
  });
});
