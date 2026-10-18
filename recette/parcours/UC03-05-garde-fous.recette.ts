import { capture, expect, test } from "./outils";
import { creerCompte, DOSSIER, fenetreAdmin, fermer, ligne, ouvrirListe } from "./aides-utilisateurs";

const TIANA = { nom: "RAZAFINDRAKOTO Tiana", email: "tiana.razafindrakoto@ifspa.mg", role: "Administrateur" as const };
const LALAINA = { nom: "RANDRIAMIHAJA Lalaina", email: "lalaina.randriamihaja@ifspa.mg", role: "Secrétariat" as const };
const VOAHANGY = { nom: "RAZAFY Voahangy", email: "voahangy.razafy@ifspa.mg", role: "Secrétariat" as const };

test("UC03-05 : garde-fous, soi-même et comptes modifiés entre-temps", async ({ browser }) => {
  test.setTimeout(240_000);
  const w1 = await fenetreAdmin(browser, { width: 1440, height: 1300 });
  const w2 = await fenetreAdmin(browser, { width: 1440, height: 1300 });

  try {
    await test.step("1. Sur sa propre ligne, l'administrateur n'a aucune action : « Vous » et une pastille d'information", async () => {
      await ouvrirListe(w1.page);
      const moi = ligne(w1.page, "admin@ifspa.mg");
      await expect(moi).toContainText("Vous");
      await expect(moi.getByRole("button", { name: /Changer le rôle|Réinitialiser|Désactiver/ })).toHaveCount(0);
      await expect(ligne(w1.page, "secretariat@ifspa.mg").getByRole("button", { name: "Désactiver le compte de Hanitra RAKOTO" })).toBeVisible();
      await capture(w1.page, DOSSIER, "UC03-05-01-propre-ligne");
    });

    await test.step("2. La pastille explique pourquoi : rôle, mot de passe et désactivation de son propre compte sont refusés", async () => {
      await ligne(w1.page, "admin@ifspa.mg").getByRole("button", { name: "Pourquoi certaines actions ne sont pas proposées" }).click();
      const info = w1.page.getByRole("dialog");
      await expect(info.getByText("Vous ne pouvez pas changer votre propre rôle.")).toBeVisible();
      await expect(info.getByText("Vous ne pouvez pas réinitialiser votre propre mot de passe ici : demandez-le à un autre administrateur.")).toBeVisible();
      await expect(info.getByText("Vous ne pouvez pas désactiver votre propre compte.")).toBeVisible();
      await capture(w1.page, DOSSIER, "UC03-05-02-motifs");
      await w1.page.keyboard.press("Escape");
    });

    await test.step("3. Un second administrateur est créé : il peut être désactivé puis réactivé, puisqu'il en reste un autre", async () => {
      await creerCompte(w2.page, TIANA);
      const l = ligne(w2.page, TIANA.email);
      await expect(l.getByRole("button", { name: `Désactiver le compte de ${TIANA.nom}` })).toBeVisible();
      await l.getByRole("button", { name: `Désactiver le compte de ${TIANA.nom}` }).click();
      await w2.page.getByRole("alertdialog", { name: `Désactiver le compte de ${TIANA.nom} ?` }).getByRole("button", { name: "Désactiver le compte" }).click();
      await expect(w2.page.getByText(`Compte de ${TIANA.nom} désactivé : il ne peut plus se connecter.`)).toBeVisible();
      await expect(l).toContainText("Désactivé");
      await expect(l.getByRole("button", { name: `Changer le rôle de ${TIANA.nom}` })).toHaveCount(1);
      await capture(w2.page, DOSSIER, "UC03-05-03-admin-desactive");
      await l.getByRole("button", { name: `Réactiver le compte de ${TIANA.nom}` }).click();
      await expect(w2.page.getByText(`Compte de ${TIANA.nom} réactivé.`)).toBeVisible();
      await expect(l).toContainText("Actif");
    });

    await test.step("4. Deux fenêtres de l'administrateur : un compte promu entre-temps ne peut pas l'être deux fois (« Ce compte a déjà ce rôle. »)", async () => {
      await creerCompte(w2.page, LALAINA);
      await ouvrirListe(w1.page);
      const l1 = ligne(w1.page, LALAINA.email);
      await expect(l1.getByRole("button", { name: `Changer le rôle de ${LALAINA.nom}` })).toHaveText("Passer en administrateur");
      const l2 = ligne(w2.page, LALAINA.email);
      await l2.getByRole("button", { name: `Changer le rôle de ${LALAINA.nom}` }).click();
      await w2.page.getByRole("alertdialog", { name: `Passer ${LALAINA.nom} en administrateur ?` }).getByRole("button", { name: "Passer en administrateur" }).click();
      await expect(w2.page.getByText(`${LALAINA.nom} est désormais Administrateur. Ses sessions ouvertes ont été fermées.`)).toBeVisible();
      await capture(w2.page, DOSSIER, "UC03-05-04-promue-fenetre-2");
      await l1.getByRole("button", { name: `Changer le rôle de ${LALAINA.nom}` }).click();
      const confirmation = w1.page.getByRole("alertdialog", { name: `Passer ${LALAINA.nom} en administrateur ?` });
      await confirmation.getByRole("button", { name: "Passer en administrateur" }).click();
      await expect(confirmation.getByText("Ce compte a déjà ce rôle.")).toBeVisible();
      await capture(w1.page, DOSSIER, "UC03-05-05-deja-ce-role");
      await confirmation.getByRole("button", { name: "Annuler" }).click();
    });

    await test.step("5. Un compte désactivé entre-temps ne peut pas l'être deux fois (« Ce compte est déjà désactivé. »)", async () => {
      await creerCompte(w2.page, VOAHANGY);
      await ouvrirListe(w1.page);
      await expect(ligne(w1.page, VOAHANGY.email).getByRole("button", { name: `Désactiver le compte de ${VOAHANGY.nom}` })).toBeVisible();
      await ligne(w2.page, VOAHANGY.email).getByRole("button", { name: `Désactiver le compte de ${VOAHANGY.nom}` }).click();
      await w2.page.getByRole("alertdialog", { name: `Désactiver le compte de ${VOAHANGY.nom} ?` }).getByRole("button", { name: "Désactiver le compte" }).click();
      await expect(ligne(w2.page, VOAHANGY.email)).toContainText("Désactivé");
      await ligne(w1.page, VOAHANGY.email).getByRole("button", { name: `Désactiver le compte de ${VOAHANGY.nom}` }).click();
      const confirmation = w1.page.getByRole("alertdialog", { name: `Désactiver le compte de ${VOAHANGY.nom} ?` });
      await confirmation.getByRole("button", { name: "Désactiver le compte" }).click();
      await expect(confirmation.getByText("Ce compte est déjà désactivé.")).toBeVisible();
      await capture(w1.page, DOSSIER, "UC03-05-06-deja-desactive");
      await confirmation.getByRole("button", { name: "Annuler" }).click();
    });

    await test.step("6. Un compte réactivé entre-temps ne peut pas l'être deux fois (« Ce compte est déjà actif. »)", async () => {
      await ouvrirListe(w1.page);
      await expect(ligne(w1.page, VOAHANGY.email).getByRole("button", { name: `Réactiver le compte de ${VOAHANGY.nom}` })).toBeVisible();
      await ouvrirListe(w2.page);
      await ligne(w2.page, VOAHANGY.email).getByRole("button", { name: `Réactiver le compte de ${VOAHANGY.nom}` }).click();
      await expect(w2.page.getByText(`Compte de ${VOAHANGY.nom} réactivé.`)).toBeVisible();
      await ligne(w1.page, VOAHANGY.email).getByRole("button", { name: `Réactiver le compte de ${VOAHANGY.nom}` }).click();
      await expect(w1.page.getByText("Ce compte est déjà actif.")).toBeVisible();
      await capture(w1.page, DOSSIER, "UC03-05-07-deja-actif");
    });
  } finally {
    await fermer(w1.contexte, w2.contexte);
  }
});
