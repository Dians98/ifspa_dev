import { capture, expect, test } from "./outils";
import {
  DOSSIER,
  fenetreAdmin,
  fenetreVierge,
  fermer,
  ligne,
  ouvrirListe,
  seConnecterJusqueAuTableauDeBord,
  verifierUtilisateur,
  viderLimiteConnexion,
} from "./aides-utilisateurs";

const MIHAJA = { nom: "RAKOTONDRAZAKA Mihaja", email: "mihaja.rakotondrazaka@ifspa.mg", role: "Administrateur" as const };

test("UC03-01 : création d'un compte, refus du formulaire, administrateur créé d'emblée", async ({ browser }) => {
  test.setTimeout(240_000);
  const { contexte, page } = await fenetreAdmin(browser);
  await contexte.grantPermissions(["clipboard-read", "clipboard-write"]);
  const poste = await fenetreVierge(browser);
  await viderLimiteConnexion(poste.page);
  let motDePasse = "";

  try {
    await test.step("1. L'administrateur ouvre « Nouvel utilisateur » : le rôle Secrétariat est proposé, avec son aide", async () => {
      await ouvrirListe(page);
      await expect(page.getByText("Pas d'inscription libre : seuls les comptes créés ici peuvent se connecter.")).toBeVisible();
      await expect(page.getByRole("row")).toHaveCount(3);
      await capture(page, DOSSIER, "UC03-01-01-liste-de-depart");
      await page.getByRole("button", { name: "Nouvel utilisateur" }).click();
      const dialogue = page.getByRole("dialog", { name: "Nouvel utilisateur" });
      await expect(dialogue.getByRole("combobox", { name: "Rôle" })).toContainText("Secrétariat");
      await expect(dialogue.getByText("Inscrit les étudiants, encaisse, imprime les reçus et lance les admissions. Ne peut ni supprimer ni annuler, et n'accède pas aux Paramètres.")).toBeVisible();
      await capture(page, DOSSIER, "UC03-01-02-formulaire");
    });

    await test.step("2. Créer sans rien saisir : les deux champs sont signalés", async () => {
      const dialogue = page.getByRole("dialog", { name: "Nouvel utilisateur" });
      await dialogue.getByRole("button", { name: "Créer le compte" }).click();
      await expect(dialogue.getByText("Indiquez le nom complet.")).toBeVisible();
      await expect(dialogue.getByText("Indiquez le courriel.").or(dialogue.getByText("Adresse e-mail invalide."))).toBeVisible();
      await capture(page, DOSSIER, "UC03-01-03-champs-vides");
    });

    await test.step("3. Un courriel mal écrit est refusé", async () => {
      const dialogue = page.getByRole("dialog", { name: "Nouvel utilisateur" });
      await dialogue.getByLabel("Nom").fill("RAKOTONDRAZAKA Mihaja");
      await dialogue.getByLabel("Courriel").fill("mihaja.rakotondrazaka");
      await dialogue.getByRole("button", { name: "Créer le compte" }).click();
      await expect(dialogue.getByText("Adresse e-mail invalide.")).toBeVisible();
      await capture(page, DOSSIER, "UC03-01-04-courriel-invalide");
    });

    await test.step("4. Un courriel déjà utilisé est refusé, même écrit en majuscules", async () => {
      const dialogue = page.getByRole("dialog", { name: "Nouvel utilisateur" });
      await dialogue.getByLabel("Courriel").fill("ADMIN@IFSPA.MG");
      await dialogue.getByRole("button", { name: "Créer le compte" }).click();
      await expect(dialogue.getByText("Un compte existe déjà avec ce courriel.")).toBeVisible();
      await capture(page, DOSSIER, "UC03-01-05-courriel-deja-pris");
    });

    await test.step("5. Rôle « Administrateur » : l'aide change, le compte est créé, le mot de passe provisoire s'affiche", async () => {
      const dialogue = page.getByRole("dialog", { name: "Nouvel utilisateur" });
      await dialogue.getByLabel("Courriel").fill(MIHAJA.email);
      await dialogue.getByRole("combobox", { name: "Rôle" }).click();
      await page.getByRole("option", { name: "Administrateur" }).click();
      await expect(dialogue.getByText("A tous les droits : annulations, suppressions et Paramètres.")).toBeVisible();
      await capture(page, DOSSIER, "UC03-01-06-role-administrateur");
      await dialogue.getByRole("button", { name: "Créer le compte" }).click();
      const resultat = page.getByRole("dialog", { name: `Compte créé pour ${MIHAJA.nom}` });
      await expect(resultat).toBeVisible();
      await expect(page.getByText(`Compte Administrateur créé pour ${MIHAJA.nom}. Transmettez-lui ce mot de passe provisoire.`)).toBeVisible();
      motDePasse = ((await resultat.getByText("Mot de passe provisoire").locator("xpath=following-sibling::p").textContent()) ?? "").trim();
      expect(motDePasse).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
      await expect(resultat.getByText("Ce mot de passe ne s'affichera plus.")).toBeVisible();
      await capture(page, DOSSIER, "UC03-01-07-compte-cree");
    });

    await test.step("6. « Copier le mot de passe » le met dans le presse-papiers, puis « Terminé » referme la fenêtre", async () => {
      const resultat = page.getByRole("dialog", { name: `Compte créé pour ${MIHAJA.nom}` });
      await resultat.getByRole("button", { name: "Copier le mot de passe" }).click();
      await expect(resultat.getByText("Mot de passe copié.")).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(motDePasse);
      await capture(page, DOSSIER, "UC03-01-08-mot-de-passe-copie");
      await resultat.getByRole("button", { name: "Terminé" }).click();
      const l = ligne(page, MIHAJA.email);
      await expect(l).toContainText("Administrateur");
      await expect(l).toContainText("Actif");
      await expect(l).toContainText("Aucune session ouverte");
      await expect(page.getByRole("row")).toHaveCount(4);
      await capture(page, DOSSIER, "UC03-01-09-liste-apres-creation");
    });

    await test.step("7. Le mot de passe n'est plus consultable : la fenêtre ne le redonne pas, seule la réinitialisation en génère un autre", async () => {
      await page.reload();
      await expect(ligne(page, MIHAJA.email)).toBeVisible();
      await expect(page.getByText(motDePasse)).toHaveCount(0);
      await expect(ligne(page, MIHAJA.email).getByRole("button", { name: `Réinitialiser le mot de passe de ${MIHAJA.nom}` })).toBeVisible();
      await capture(page, DOSSIER, "UC03-01-10-mot-de-passe-introuvable");
    });

    await test.step("8. Mihaja se connecte avec ce mot de passe : elle est administratrice et voit Paramètres", async () => {
      await seConnecterJusqueAuTableauDeBord(poste.page, MIHAJA.email, motDePasse);
      await verifierUtilisateur(poste.page, MIHAJA.nom, "Administrateur");
      await expect(poste.page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Paramètres" })).toBeVisible();
      await capture(poste.page, DOSSIER, "UC03-01-11-mihaja-connectee");
    });
  } finally {
    await fermer(contexte, poste.contexte);
  }
});

