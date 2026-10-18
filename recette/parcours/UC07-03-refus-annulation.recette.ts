import { DOSSIER_UC07 as DOSSIER, ligne, ouvrirAdmin, ouvrirPaiements, RECUS, verifierTotal } from "./aides-paiements";
import type { Locator } from "@playwright/test";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

const NUMERO = RECUS.tiana;

test("UC07-03 : l'annulation est refusée sans motif, puis quand le reçu a déjà été annulé", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { baseURL } = test.info().project.use;

  const ouvrirFenetre = async () => {
    await ligne(page, NUMERO).getByRole("button", { name: `Annuler le reçu ${NUMERO}` }).click();
    const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${NUMERO}` });
    await expect(dialogue).toBeVisible();
    return dialogue;
  };
  const valider = (dialogue: Locator) => dialogue.getByRole("button", { name: `Annuler le reçu ${NUMERO}` });
  const messageMotif = "Indiquez le motif de l'annulation (5 caractères au moins).";

  await test.step("1. Annuler sans écrire de motif : refusé, la fenêtre reste ouverte", async () => {
    await ouvrirPaiements(page);
    await expect(page.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
    const dialogue = await ouvrirFenetre();
    await valider(dialogue).click();
    await expect(dialogue.getByText(messageMotif)).toBeVisible();
    await expect(dialogue.getByLabel("Motif de l'annulation")).toBeFocused();
    await expect(dialogue).toBeVisible();
    await capture(page, DOSSIER, "UC07-03-01-sans-motif", dialogue);
  });

  await test.step("2. Un motif trop court (« abc »), ou fait d'espaces : même refus", async () => {
    const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${NUMERO}` });
    await dialogue.getByLabel("Motif de l'annulation").fill("abc");
    await valider(dialogue).click();
    await expect(dialogue.getByText(messageMotif)).toBeVisible();
    await capture(page, DOSSIER, "UC07-03-02-motif-trop-court", dialogue);
    await dialogue.getByLabel("Motif de l'annulation").fill("      ");
    await valider(dialogue).click();
    await expect(dialogue.getByText(messageMotif)).toBeVisible();
  });

  await test.step("3. Un motif de plus de 300 caractères : refusé", async () => {
    const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${NUMERO}` });
    await dialogue.getByLabel("Motif de l'annulation").fill("Motif long ".repeat(28).slice(0, 301));
    await valider(dialogue).click();
    await expect(dialogue.getByText("Motif trop long (300 caractères maximum).")).toBeVisible();
    await capture(page, DOSSIER, "UC07-03-03-motif-trop-long", dialogue);
  });

  await test.step("3b. Sonde : 301 caractères sans espace dans le motif, la fenêtre reste-t-elle utilisable ?", async () => {
    const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${NUMERO}` });
    await dialogue.getByLabel("Motif de l'annulation").fill("x".repeat(301));
    const fenetre = await dialogue.boundingBox();
    const bouton = await valider(dialogue).boundingBox();
    const largeurPage = page.viewportSize()?.width ?? 0;
    console.log(`SONDE-MOTIF fenetre=${JSON.stringify(fenetre)} bouton=${JSON.stringify(bouton)} largeurPage=${largeurPage}`);
    await capture(page, DOSSIER, "UC07-03-3b-echec-motif-sans-espace");
    await dialogue.getByLabel("Motif de l'annulation").fill("");
  });

  await test.step("4. « Garder le reçu » ferme la fenêtre : rien n'est annulé", async () => {
    const dialogue = page.getByRole("dialog", { name: `Annuler le reçu ${NUMERO}` });
    await dialogue.getByRole("button", { name: "Garder le reçu" }).click();
    await expect(dialogue).toBeHidden();
    const l = ligne(page, NUMERO);
    await expect(l).toContainText("Valide");
    await expect(l.getByRole("button", { name: `Annuler le reçu ${NUMERO}` })).toBeVisible();
    await verifierTotal(page, "Total encaissé", 360_000);
    await capture(page, DOSSIER, "UC07-03-04-recu-garde");
  });

  await test.step("5. Deux administrateurs sur le même reçu : le second à valider n'écrase rien", async () => {
    const { contexte, page: second } = await ouvrirAdmin(browser, baseURL);
    try {
      await ouvrirPaiements(second);
      await expect(second.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();

      const dialogue = await ouvrirFenetre();
      await dialogue.getByLabel("Motif de l'annulation").fill("Doublon de saisie avec un autre poste");

      await ligne(second, NUMERO).getByRole("button", { name: `Annuler le reçu ${NUMERO}` }).click();
      const dialogueSecond = second.getByRole("dialog", { name: `Annuler le reçu ${NUMERO}` });
      await dialogueSecond.getByLabel("Motif de l'annulation").fill("Paiement rejeté par l'opérateur Orange Money");
      await dialogueSecond.getByRole("button", { name: `Annuler le reçu ${NUMERO}` }).click();
      await expect(dialogueSecond).toBeHidden();
      await expect(ligne(second, NUMERO)).toContainText("Annulé");

      await valider(dialogue).click();
      // La ligne passe à « Annulé » et le bouton disparaît : la fenêtre s'en va avec lui, le message « déjà annulé » ne reste qu'un instant.
      await expect(dialogue).toBeHidden();
      await expect(ligne(page, NUMERO)).toContainText("Annulé");
    } finally {
      await contexte.close();
    }
  });

  await test.step("6. La page se met à jour : le motif et l'auteur sont ceux de la première annulation", async () => {
    const l = ligne(page, NUMERO);
    await expect(l).toContainText("Annulé");
    await expect(l).toContainText("Paiement rejeté par l'opérateur Orange Money — par Administrateur IFSPA le");
    await expect(l).not.toContainText("Doublon de saisie avec un autre poste");
    await expect(l.getByRole("button", { name: /^Annuler/ })).toHaveCount(0);
    await verifierTotal(page, "Total encaissé", 260_000);
    await capture(page, DOSSIER, "UC07-03-06-premiere-annulation-gardee");
  });
});
