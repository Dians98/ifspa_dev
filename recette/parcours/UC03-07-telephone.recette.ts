import { capture, expect, SESSIONS, test } from "./outils";
import { DOSSIER, ligne, ouvrirListe, vue } from "./aides-utilisateurs";

const ANJA = { nom: "ANDRIAMASY Anja", email: "anja.andriamasy@ifspa.mg", role: "Secrétariat" as const };

test.use({ storageState: SESSIONS.admin });

test("UC03-07 : gérer les comptes depuis un téléphone", async ({ page }) => {
  test.setTimeout(120_000);
  const sansDebordement = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await test.step("1. La liste des utilisateurs s'affiche en cartes, sans défilement horizontal", async () => {
    await ouvrirListe(page);
    await expect(page.getByRole("button", { name: "Nouvel utilisateur" })).toBeVisible();
    await sansDebordement();
    await vue(page, "UC03-07-01-liste");
  });

  await test.step("2. Créer un compte : formulaire puis mot de passe provisoire", async () => {
    await page.getByRole("button", { name: "Nouvel utilisateur" }).click();
    const dialogue = page.getByRole("dialog", { name: "Nouvel utilisateur" });
    await dialogue.getByLabel("Nom").fill(ANJA.nom);
    await dialogue.getByLabel("Courriel").fill(ANJA.email);
    await vue(page, "UC03-07-02-formulaire");
    await dialogue.getByRole("button", { name: "Créer le compte" }).click();
    const resultat = page.getByRole("dialog", { name: `Compte créé pour ${ANJA.nom}` });
    await expect(resultat).toBeVisible();
    await sansDebordement();
    await vue(page, "UC03-07-03-mot-de-passe");
    await resultat.getByRole("button", { name: "Terminé" }).click();
    await expect(ligne(page, ANJA.email)).toContainText("Secrétariat");
  });

  await test.step("3. Les boutons d'action de sa carte font au moins 44 px de haut", async () => {
    const l = ligne(page, ANJA.email);
    for (const nom of [`Changer le rôle de ${ANJA.nom}`, `Réinitialiser le mot de passe de ${ANJA.nom}`, `Désactiver le compte de ${ANJA.nom}`]) {
      const boite = await l.getByRole("button", { name: nom }).boundingBox();
      expect(boite?.height ?? 0, nom).toBeGreaterThanOrEqual(44);
    }
    await l.scrollIntoViewIfNeeded();
    await capture(page, DOSSIER, "UC03-07-04-carte", l);
  });

  await test.step("4. Changer le rôle : la confirmation tient à l'écran", async () => {
    await ligne(page, ANJA.email).getByRole("button", { name: `Changer le rôle de ${ANJA.nom}` }).click();
    const confirmation = page.getByRole("alertdialog", { name: `Passer ${ANJA.nom} en administrateur ?` });
    await expect(confirmation).toBeVisible();
    await vue(page, "UC03-07-05-confirmation-role");
    await confirmation.getByRole("button", { name: "Passer en administrateur" }).click();
    await expect(page.getByText(`${ANJA.nom} est désormais Administrateur. Ses sessions ouvertes ont été fermées.`)).toBeVisible();
    await expect(ligne(page, ANJA.email)).toContainText("Administrateur");
    await vue(page, "UC03-07-06-role-change");
  });

  await test.step("5. Réinitialiser le mot de passe puis désactiver le compte", async () => {
    await ligne(page, ANJA.email).getByRole("button", { name: `Réinitialiser le mot de passe de ${ANJA.nom}` }).click();
    const dialogue = page.getByRole("dialog", { name: `Réinitialiser le mot de passe de ${ANJA.nom} ?` });
    await dialogue.getByRole("button", { name: "Réinitialiser le mot de passe" }).click();
    const resultat = page.getByRole("dialog", { name: `Nouveau mot de passe pour ${ANJA.nom}` });
    await expect(resultat).toBeVisible();
    await vue(page, "UC03-07-07-nouveau-mot-de-passe");
    await resultat.getByRole("button", { name: "Terminé" }).click();
    await ligne(page, ANJA.email).getByRole("button", { name: `Désactiver le compte de ${ANJA.nom}` }).click();
    const confirmation = page.getByRole("alertdialog", { name: `Désactiver le compte de ${ANJA.nom} ?` });
    await vue(page, "UC03-07-08-confirmation-desactivation");
    await confirmation.getByRole("button", { name: "Désactiver le compte" }).click();
    await expect(ligne(page, ANJA.email)).toContainText("Désactivé");
    await ligne(page, ANJA.email).scrollIntoViewIfNeeded();
    await vue(page, "UC03-07-09-desactive");
  });

  await test.step("6. Sa propre carte : « Vous » et seulement « Changer mon mot de passe »", async () => {
    const moi = ligne(page, "admin@ifspa.mg");
    await moi.scrollIntoViewIfNeeded();
    await expect(moi).toContainText("Vous");
    await expect(moi.getByRole("button", { name: /Changer le rôle|Réinitialiser|Désactiver/ })).toHaveCount(0);
    await expect(moi.getByRole("button", { name: "Pourquoi certaines actions ne sont pas proposées" })).toHaveCount(0);
    await expect(moi.getByRole("button", { name: "Changer mon mot de passe" })).toBeVisible();
    await vue(page, "UC03-07-10-propre-carte");
  });
});
