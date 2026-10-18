import type { Page } from "@playwright/test";
import { capture, expect, SESSIONS, test } from "./outils";
import { DOSSIER, viderLimiteConnexion, SANS_SESSION, respecterLimiteConnexion, saisirIdentifiants } from "./aides-connexion";

const NOM = "RANDRIANASOLO Haingo";
const EMAIL = "haingo.randrianasolo@ifspa.mg";

async function ligne(page: Page) {
  await page.goto("/app/parametres/utilisateurs");
  await expect(page.getByRole("heading", { name: "Utilisateurs" }).first()).toBeVisible();
  return page.getByRole("row").filter({ hasText: EMAIL });
}

test("UC01-06 : un compte désactivé ne peut plus se connecter, ni garder sa session", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await browser.newContext({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1000 }, locale: "fr-FR", timezoneId: "Indian/Antananarivo" });
  const poste = await browser.newContext({ storageState: SANS_SESSION, viewport: { width: 1440, height: 1000 }, locale: "fr-FR", timezoneId: "Indian/Antananarivo" });
  const pageAdmin = await admin.newPage();
  const pagePoste = await poste.newPage();
  let motDePasse = "";
  await viderLimiteConnexion(pagePoste);

  try {
    await test.step("1. L'administrateur crée le compte de RANDRIANASOLO Haingo (Paramètres › Utilisateurs)", async () => {
      await pageAdmin.goto("/app/parametres/utilisateurs");
      await pageAdmin.getByRole("button", { name: "Nouvel utilisateur" }).click();
      const dialogue = pageAdmin.getByRole("dialog", { name: "Nouvel utilisateur" });
      await dialogue.getByLabel("Nom").fill(NOM);
      await dialogue.getByLabel("Courriel").fill(EMAIL);
      await expect(dialogue.getByRole("combobox", { name: "Rôle" })).toContainText("Secrétariat");
      await dialogue.getByRole("button", { name: "Créer le compte" }).click();
      const resultat = pageAdmin.getByRole("dialog", { name: `Compte créé pour ${NOM}` });
      await expect(resultat).toBeVisible();
      motDePasse = ((await resultat.getByText("Mot de passe provisoire").locator("xpath=following-sibling::p").textContent()) ?? "").trim();
      expect(motDePasse.length).toBeGreaterThanOrEqual(8);
      await capture(pageAdmin, DOSSIER, "UC01-06-01-compte-cree");
      await resultat.getByRole("button", { name: "Terminé" }).click();
      await expect(pageAdmin.getByRole("row").filter({ hasText: EMAIL })).toContainText("Aucune session ouverte");
    });

    await test.step("2. Haingo se connecte avec son mot de passe provisoire", async () => {
      await pagePoste.goto("/connexion");
      await saisirIdentifiants(pagePoste, EMAIL, motDePasse);
      await respecterLimiteConnexion(pagePoste);
      await pagePoste.getByRole("button", { name: "Se connecter" }).click();
      await pagePoste.waitForURL("**/app/dashboard");
      const barre = pagePoste.getByRole("complementary", { name: "Barre latérale" });
      await expect(barre.getByText(NOM, { exact: true })).toBeVisible();
      await expect(barre.getByText("Secrétariat", { exact: true })).toBeVisible();
      await capture(pagePoste, DOSSIER, "UC01-06-02-haingo-connectee");
    });

    await test.step("3. L'administrateur voit sa dernière session", async () => {
      const l = await ligne(pageAdmin);
      await expect(l).toContainText("Actif");
      await expect(l).not.toContainText("Aucune session ouverte");
      await capture(pageAdmin, DOSSIER, "UC01-06-03-derniere-session");
    });

    await test.step("4. L'administrateur désactive le compte", async () => {
      await pageAdmin.getByRole("button", { name: `Désactiver le compte de ${NOM}` }).click();
      const confirmation = pageAdmin.getByRole("alertdialog", { name: `Désactiver le compte de ${NOM} ?` });
      await expect(confirmation).toContainText("Elle ou il ne pourra plus se connecter. Ses paiements restent attribués à son nom, et vous pourrez réactiver le compte à tout moment.");
      await capture(pageAdmin, DOSSIER, "UC01-06-04-confirmation");
      await confirmation.getByRole("button", { name: "Désactiver le compte" }).click();
      await expect(pageAdmin.getByText(`Compte de ${NOM} désactivé : il ne peut plus se connecter.`)).toBeVisible();
      await expect(pageAdmin.getByRole("row").filter({ hasText: EMAIL })).toContainText("Désactivé");
      await capture(pageAdmin, DOSSIER, "UC01-06-05-desactive");
    });

    await test.step("5. Sa fenêtre était restée ouverte : au prochain clic sur « Étudiants », la connexion est redemandée", async () => {
      await pagePoste.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Étudiants", exact: true }).click();
      await pagePoste.waitForTimeout(4000);
      await capture(pagePoste, DOSSIER, "UC01-06-06-clic-apres-desactivation");
      // Constat : la liste s'ouvre encore (le layout n'est pas rejoué à la navigation), voir le rapport.
      expect.soft(pagePoste.url(), "la connexion devrait être redemandée").toMatch(/\/connexion/);
    });

    await test.step("6. En rechargeant la page (F5), la connexion est redemandée", async () => {
      await pagePoste.reload();
      await pagePoste.waitForURL(/\/connexion/);
      await expect(pagePoste.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
      await capture(pagePoste, DOSSIER, "UC01-06-07-session-fermee-au-rechargement");
    });

    await test.step("7. Haingo essaie de se reconnecter : « Ce compte est désactivé. Contactez l'administrateur. »", async () => {
      await pagePoste.goto("/connexion");
      await saisirIdentifiants(pagePoste, EMAIL, motDePasse);
      await respecterLimiteConnexion(pagePoste);
      await pagePoste.getByRole("button", { name: "Se connecter" }).click();
      await expect(pagePoste.getByRole("alert").filter({ hasText: "Ce compte est désactivé. Contactez l'administrateur." })).toBeVisible();
      await expect(pagePoste).toHaveURL(/\/connexion$/);
      await capture(pagePoste, DOSSIER, "UC01-06-08-connexion-refusee");
    });

    await test.step("8. L'administrateur réactive le compte : Haingo se reconnecte", async () => {
      const l = await ligne(pageAdmin);
      await l.getByRole("button", { name: `Réactiver le compte de ${NOM}` }).click();
      await expect(pageAdmin.getByText(`Compte de ${NOM} réactivé.`)).toBeVisible();
      await expect(pageAdmin.getByRole("row").filter({ hasText: EMAIL })).toContainText("Actif");
      await capture(pageAdmin, DOSSIER, "UC01-06-09-reactive");
      await saisirIdentifiants(pagePoste, EMAIL, motDePasse);
      await respecterLimiteConnexion(pagePoste);
      await pagePoste.getByRole("button", { name: "Se connecter" }).click();
      await pagePoste.waitForURL("**/app/dashboard");
      await expect(pagePoste.getByRole("complementary", { name: "Barre latérale" }).getByText(NOM, { exact: true })).toBeVisible();
      await capture(pagePoste, DOSSIER, "UC01-06-10-reconnectee");
    });
  } finally {
    await admin.close();
    await poste.close();
  }
});
