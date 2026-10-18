import { COMPTES } from "../../e2e/app/comptes";
import { capture, expect, test } from "./outils";
import {
  creerCompte,
  DOSSIER,
  fenetreAdmin,
  fenetreVierge,
  fermer,
  ligne,
  ouvrirListe,
  PAGE_UTILISATEURS,
  seConnecter,
  seConnecterJusqueAuTableauDeBord,
  verifierUtilisateur,
  viderLimiteConnexion,
} from "./aides-utilisateurs";

const TAHINA = { nom: "ANDRIANTSOA Tahina", email: "tahina.andriantsoa@ifspa.mg", role: "Administrateur" as const };

test("UC03-03 : un administrateur repasse en secrétariat, sa fenêtre ouverte n'a plus la main", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await fenetreAdmin(browser);
  const poste = await fenetreVierge(browser);
  const poste2 = await fenetreVierge(browser);
  await viderLimiteConnexion(poste.page);
  let motDePasse = "";

  try {
    await test.step("1. L'administrateur crée le compte administrateur de ANDRIANTSOA Tahina ; elle se connecte et ouvre Paramètres › Utilisateurs", async () => {
      motDePasse = await creerCompte(admin.page, TAHINA);
      await seConnecterJusqueAuTableauDeBord(poste.page, TAHINA.email, motDePasse);
      await verifierUtilisateur(poste.page, TAHINA.nom, "Administrateur");
      await ouvrirListe(poste.page);
      await expect(poste.page.getByRole("button", { name: `Réinitialiser le mot de passe de Hanitra RAKOTO` })).toBeVisible();
      await capture(poste.page, DOSSIER, "UC03-03-01-tahina-administratrice");
      // Seconde fenêtre de la même personne, gardée sur Paramètres pour tester la navigation après la rétrogradation.
      await seConnecterJusqueAuTableauDeBord(poste2.page, TAHINA.email, motDePasse);
      await ouvrirListe(poste2.page);
    });

    await test.step("2. L'administrateur demande « Passer en secrétariat » : la confirmation décrit la perte de droits", async () => {
      await ouvrirListe(admin.page);
      await ligne(admin.page, TAHINA.email).getByRole("button", { name: `Changer le rôle de ${TAHINA.nom}` }).click();
      const confirmation = admin.page.getByRole("alertdialog", { name: `Passer ${TAHINA.nom} en secrétariat ?` });
      await expect(confirmation).toContainText("Elle ou il ne pourra plus ni annuler, ni supprimer, ni accéder aux Paramètres. Ses sessions ouvertes seront fermées : une nouvelle connexion sera nécessaire.");
      await capture(admin.page, DOSSIER, "UC03-03-02-confirmation");
    });

    await test.step("3. Confirmer : « ANDRIANTSOA Tahina est désormais Secrétariat. Ses sessions ouvertes ont été fermées. »", async () => {
      const confirmation = admin.page.getByRole("alertdialog", { name: `Passer ${TAHINA.nom} en secrétariat ?` });
      await confirmation.getByRole("button", { name: "Passer en secrétariat" }).click();
      await expect(admin.page.getByText(`${TAHINA.nom} est désormais Secrétariat. Ses sessions ouvertes ont été fermées.`)).toBeVisible();
      const l = ligne(admin.page, TAHINA.email);
      await expect(l).toContainText("Secrétariat");
      await expect(l.getByRole("button", { name: `Changer le rôle de ${TAHINA.nom}` })).toHaveText("Passer en administrateur");
      await expect(l).toContainText("Aucune session ouverte");
      await verifierUtilisateur(admin.page, "Administrateur IFSPA", "Administrateur");
      await capture(admin.page, DOSSIER, "UC03-03-03-retrogradee");
    });

    await test.step("4. Dans sa fenêtre restée ouverte, Tahina tente encore de réinitialiser un mot de passe", async () => {
      await poste.page.getByRole("button", { name: "Réinitialiser le mot de passe de Hanitra RAKOTO" }).click();
      const dialogue = poste.page.getByRole("dialog", { name: "Réinitialiser le mot de passe de Hanitra RAKOTO ?" });
      await expect(dialogue).toBeVisible();
      await dialogue.getByRole("button", { name: "Réinitialiser le mot de passe" }).click();
      await poste.page.waitForTimeout(4000);
      await expect(poste.page).toHaveURL(/\/connexion/);
      await capture(poste.page, DOSSIER, "UC03-03-04-action-apres-retrogradation");
    });

    await test.step("5. Dans son autre fenêtre restée sur Paramètres, elle clique l'onglet « Tarifs »", async () => {
      await poste2.page.getByRole("tab", { name: "Tarifs" }).or(poste2.page.getByRole("link", { name: "Tarifs" })).first().click();
      await poste2.page.waitForTimeout(4000);
      await capture(poste2.page, DOSSIER, "UC03-03-05-navigation-apres-retrogradation");
    });

    await test.step("6. Le mot de passe de Hanitra RAKOTO n'a pas changé : elle se connecte avec le sien", async () => {
      const hanitra = await fenetreVierge(browser);
      try {
        await seConnecterJusqueAuTableauDeBord(hanitra.page, COMPTES.secretariat.email, COMPTES.secretariat.motDePasse);
        await verifierUtilisateur(hanitra.page, "Hanitra RAKOTO", "Secrétariat");
        await capture(hanitra.page, DOSSIER, "UC03-03-06-hanitra-intacte");
      } finally {
        await fermer(hanitra.contexte);
      }
    });

    await test.step("7. Elle se reconnecte : secrétariat, sans Paramètres ; l'écran Utilisateurs lui est fermé", async () => {
      await seConnecter(poste.page, TAHINA.email, motDePasse);
      await poste.page.waitForURL("**/app/dashboard");
      await verifierUtilisateur(poste.page, TAHINA.nom, "Secrétariat");
      await expect(poste.page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Paramètres" })).toHaveCount(0);
      await capture(poste.page, DOSSIER, "UC03-03-07-tahina-secretariat");
      await poste.page.goto(PAGE_UTILISATEURS);
      await expect(poste.page.getByRole("main").getByText("Accès réservé à l'administrateur")).toBeVisible();
      await expect(poste.page.getByRole("button", { name: "Nouvel utilisateur" })).toHaveCount(0);
      await capture(poste.page, DOSSIER, "UC03-03-08-utilisateurs-refuse");
    });
  } finally {
    await fermer(admin.contexte, poste.contexte, poste2.contexte);
  }
});
