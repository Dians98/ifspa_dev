import { capture, expect, test } from "./outils";
import {
  creerCompte,
  DOSSIER,
  fenetreAdmin,
  fenetreVierge,
  fermer,
  ligne,
  lireMotDePasse,
  ouvrirListe,
  seConnecter,
  seConnecterJusqueAuTableauDeBord,
  verifierUtilisateur,
  viderLimiteConnexion,
} from "./aides-utilisateurs";

const SOA = { nom: "RAVELOSON Soa", email: "soa.raveloson@ifspa.mg", role: "Secrétariat" as const };
const FORMAT = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;

test("UC03-04 : mot de passe perdu, l'administrateur en génère un nouveau", async ({ browser }) => {
  test.setTimeout(300_000);
  const admin = await fenetreAdmin(browser);
  const poste = await fenetreVierge(browser);
  await viderLimiteConnexion(poste.page);
  let ancien = "";
  let nouveau = "";

  async function reinitialiser(): Promise<string> {
    await ouvrirListe(admin.page);
    await ligne(admin.page, SOA.email).getByRole("button", { name: `Réinitialiser le mot de passe de ${SOA.nom}` }).click();
    const dialogue = admin.page.getByRole("dialog", { name: `Réinitialiser le mot de passe de ${SOA.nom} ?` });
    await dialogue.getByRole("button", { name: "Réinitialiser le mot de passe" }).click();
    const resultat = admin.page.getByRole("dialog", { name: `Nouveau mot de passe pour ${SOA.nom}` });
    await expect(resultat).toBeVisible();
    return lireMotDePasse(resultat);
  }

  try {
    await test.step("1. L'administrateur crée le compte de RAVELOSON Soa ; elle se connecte avec son mot de passe provisoire", async () => {
      ancien = await creerCompte(admin.page, SOA);
      await seConnecterJusqueAuTableauDeBord(poste.page, SOA.email, ancien);
      await verifierUtilisateur(poste.page, SOA.nom, "Secrétariat");
      await capture(poste.page, DOSSIER, "UC03-04-01-soa-connectee");
    });

    await test.step("2. L'administrateur clique « Réinitialiser le mot de passe » : la confirmation prévient, « Annuler » ne change rien", async () => {
      await ouvrirListe(admin.page);
      await ligne(admin.page, SOA.email).getByRole("button", { name: `Réinitialiser le mot de passe de ${SOA.nom}` }).click();
      const dialogue = admin.page.getByRole("dialog", { name: `Réinitialiser le mot de passe de ${SOA.nom} ?` });
      await expect(dialogue).toContainText("Son mot de passe actuel cessera de fonctionner et ses sessions ouvertes seront fermées. Un mot de passe provisoire s'affichera une seule fois.");
      await capture(admin.page, DOSSIER, "UC03-04-02-confirmation");
      await dialogue.getByRole("button", { name: "Annuler" }).click();
      await expect(dialogue).toHaveCount(0);
      await expect(ligne(admin.page, SOA.email)).toContainText("Actif");
    });

    await test.step("3. Confirmer : un nouveau mot de passe provisoire s'affiche, différent du premier", async () => {
      nouveau = await reinitialiser();
      expect(nouveau).toMatch(FORMAT);
      expect(nouveau).not.toBe(ancien);
      const resultat = admin.page.getByRole("dialog", { name: `Nouveau mot de passe pour ${SOA.nom}` });
      await expect(resultat).toContainText("L'ancien mot de passe ne fonctionne plus. Remettez-lui celui-ci.");
      await expect(resultat).toContainText("Ce mot de passe ne s'affichera plus.");
      await capture(admin.page, DOSSIER, "UC03-04-03-nouveau-mot-de-passe");
    });

    await test.step("4. « Terminé » referme la fenêtre : le mot de passe n'est plus consultable, une nouvelle demande repart de la confirmation", async () => {
      const resultat = admin.page.getByRole("dialog", { name: `Nouveau mot de passe pour ${SOA.nom}` });
      await resultat.getByRole("button", { name: "Terminé" }).click();
      await expect(resultat).toHaveCount(0);
      await expect(admin.page.getByText(nouveau)).toHaveCount(0);
      await ligne(admin.page, SOA.email).getByRole("button", { name: `Réinitialiser le mot de passe de ${SOA.nom}` }).click();
      const dialogue = admin.page.getByRole("dialog", { name: `Réinitialiser le mot de passe de ${SOA.nom} ?` });
      await expect(dialogue).toBeVisible();
      await expect(dialogue.getByText(nouveau)).toHaveCount(0);
      await capture(admin.page, DOSSIER, "UC03-04-04-mot-de-passe-non-redonne");
      await dialogue.getByRole("button", { name: "Annuler" }).click();
    });

    await test.step("5. Sa fenêtre restée ouverte perd la session au rechargement", async () => {
      await poste.page.reload();
      await poste.page.waitForURL(/\/connexion/);
      await capture(poste.page, DOSSIER, "UC03-04-05-session-fermee");
    });

    await test.step("6. L'ancien mot de passe est refusé : « Adresse e-mail ou mot de passe incorrect. »", async () => {
      await seConnecter(poste.page, SOA.email, ancien);
      await expect(poste.page.getByRole("alert").filter({ hasText: "Adresse e-mail ou mot de passe incorrect." })).toBeVisible();
      await expect(poste.page).toHaveURL(/\/connexion$/);
      await capture(poste.page, DOSSIER, "UC03-04-06-ancien-refuse");
    });

    await test.step("7. Le nouveau mot de passe est accepté", async () => {
      await seConnecterJusqueAuTableauDeBord(poste.page, SOA.email, nouveau);
      await verifierUtilisateur(poste.page, SOA.nom, "Secrétariat");
      await capture(poste.page, DOSSIER, "UC03-04-07-nouveau-accepte");
    });

    await test.step("8. Une deuxième réinitialisation invalide à son tour le mot de passe précédent", async () => {
      const troisieme = await reinitialiser();
      expect(troisieme).toMatch(FORMAT);
      expect(troisieme).not.toBe(nouveau);
      await admin.page.getByRole("dialog", { name: `Nouveau mot de passe pour ${SOA.nom}` }).getByRole("button", { name: "Terminé" }).click();
      await seConnecter(poste.page, SOA.email, nouveau);
      await expect(poste.page.getByRole("alert").filter({ hasText: "Adresse e-mail ou mot de passe incorrect." })).toBeVisible();
      await capture(poste.page, DOSSIER, "UC03-04-08-deuxieme-reinitialisation");
    });

    await test.step("9. Compte désactivé : le mot de passe peut être réinitialisé, mais la connexion reste refusée", async () => {
      await ouvrirListe(admin.page);
      await admin.page.getByRole("button", { name: `Désactiver le compte de ${SOA.nom}` }).click();
      await admin.page.getByRole("alertdialog", { name: `Désactiver le compte de ${SOA.nom} ?` }).getByRole("button", { name: "Désactiver le compte" }).click();
      await expect(ligne(admin.page, SOA.email)).toContainText("Désactivé");
      const quatrieme = await reinitialiser();
      expect(quatrieme).toMatch(FORMAT);
      await capture(admin.page, DOSSIER, "UC03-04-09-desactivee-reinitialisee");
      await admin.page.getByRole("dialog", { name: `Nouveau mot de passe pour ${SOA.nom}` }).getByRole("button", { name: "Terminé" }).click();
      await seConnecter(poste.page, SOA.email, quatrieme);
      await expect(poste.page.getByRole("alert").filter({ hasText: "Ce compte est désactivé. Contactez l'administrateur." })).toBeVisible();
      await capture(poste.page, DOSSIER, "UC03-04-10-desactivee-refusee");
    });
  } finally {
    await fermer(admin.contexte, poste.contexte);
  }
});
