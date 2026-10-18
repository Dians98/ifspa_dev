import { capture, expect, test } from "./outils";
import {
  creerCompte,
  DOSSIER,
  fenetreAdmin,
  fenetreVierge,
  fermer,
  ligne,
  ouvrirListe,
  seConnecter,
  seConnecterJusqueAuTableauDeBord,
  verifierUtilisateur,
  viderLimiteConnexion,
} from "./aides-utilisateurs";

const FANJA = { nom: "RASOANAIVO Fanja", email: "fanja.rasoanaivo@ifspa.mg", role: "Secrétariat" as const };

test("UC03-02 : une secrétaire devient administratrice, sa session est fermée", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await fenetreAdmin(browser);
  const poste = await fenetreVierge(browser);
  await viderLimiteConnexion(poste.page);
  let motDePasse = "";
  const menu = poste.page.getByRole("navigation", { name: "Menu principal" });

  try {
    await test.step("1. L'administrateur crée le compte secrétariat de RASOANAIVO Fanja", async () => {
      motDePasse = await creerCompte(admin.page, FANJA);
      const l = ligne(admin.page, FANJA.email);
      await expect(l).toContainText("Secrétariat");
      await expect(l.getByRole("button", { name: `Changer le rôle de ${FANJA.nom}` })).toHaveText("Passer en administrateur");
      await capture(admin.page, DOSSIER, "UC03-02-01-compte-secretariat");
    });

    await test.step("2. Fanja se connecte : secrétariat, sans rubrique Paramètres", async () => {
      await seConnecterJusqueAuTableauDeBord(poste.page, FANJA.email, motDePasse);
      await verifierUtilisateur(poste.page, FANJA.nom, "Secrétariat");
      await expect(menu.getByRole("link", { name: "Paramètres" })).toHaveCount(0);
      await capture(poste.page, DOSSIER, "UC03-02-02-fanja-secretariat");
    });

    await test.step("3. L'administrateur demande « Passer en administrateur » : la confirmation décrit les droits et la fermeture des sessions", async () => {
      await ouvrirListe(admin.page);
      await ligne(admin.page, FANJA.email).getByRole("button", { name: `Changer le rôle de ${FANJA.nom}` }).click();
      const confirmation = admin.page.getByRole("alertdialog", { name: `Passer ${FANJA.nom} en administrateur ?` });
      await expect(confirmation).toContainText("Elle ou il pourra annuler des paiements, supprimer et modifier les Paramètres. Ses sessions ouvertes seront fermées : une nouvelle connexion sera nécessaire.");
      await capture(admin.page, DOSSIER, "UC03-02-03-confirmation");
    });

    await test.step("4. Confirmer : « RASOANAIVO Fanja est désormais Administrateur. Ses sessions ouvertes ont été fermées. »", async () => {
      const confirmation = admin.page.getByRole("alertdialog", { name: `Passer ${FANJA.nom} en administrateur ?` });
      await confirmation.getByRole("button", { name: "Passer en administrateur" }).click();
      await expect(admin.page.getByText(`${FANJA.nom} est désormais Administrateur. Ses sessions ouvertes ont été fermées.`)).toBeVisible();
      const l = ligne(admin.page, FANJA.email);
      await expect(l).toContainText("Administrateur");
      await expect(l.getByRole("button", { name: `Changer le rôle de ${FANJA.nom}` })).toHaveText("Passer en secrétariat");
      await expect(l).toContainText("Aucune session ouverte");
      await verifierUtilisateur(admin.page, "Administrateur IFSPA", "Administrateur");
      await capture(admin.page, DOSSIER, "UC03-02-04-promue");
    });

    await test.step("5. Dans la fenêtre restée ouverte, Fanja perd sa session au rechargement", async () => {
      await menu.getByRole("link", { name: "Étudiants", exact: true }).click();
      await poste.page.waitForTimeout(3000);
      await capture(poste.page, DOSSIER, "UC03-02-05-clic-apres-changement");
      await poste.page.reload();
      await poste.page.waitForURL(/\/connexion/);
      await expect(poste.page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
      await capture(poste.page, DOSSIER, "UC03-02-06-session-fermee");
    });

    await test.step("6. Elle se reconnecte avec le même mot de passe : administratrice, avec Paramètres", async () => {
      await seConnecter(poste.page, FANJA.email, motDePasse);
      await poste.page.waitForURL("**/app/dashboard");
      await verifierUtilisateur(poste.page, FANJA.nom, "Administrateur");
      await expect(poste.page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Paramètres" })).toBeVisible();
      await capture(poste.page, DOSSIER, "UC03-02-07-fanja-administratrice");
      await ouvrirListe(poste.page);
      await expect(ligne(poste.page, FANJA.email)).toContainText("Vous");
      await expect(poste.page.getByRole("button", { name: "Nouvel utilisateur" })).toBeVisible();
      await capture(poste.page, DOSSIER, "UC03-02-08-fanja-parametres");
    });
  } finally {
    await fermer(admin.contexte, poste.contexte);
  }
});
