import { montantRegex } from "./aides";
import { ADMIN, ligneParametre } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 } });
test.setTimeout(90_000);

test.describe("UC02-12 : le secrétariat ne gère pas les frais", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("l'onglet Frais est réservé à l'administrateur", async ({ page }) => {
    await test.step("1. Ouvrir Paramètres › Frais : « Accès réservé à l'administrateur », ni liste ni bouton", async () => {
      await page.goto("/app/parametres/frais");
      await expect(page.getByText("Hanitra RAKO")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Accès réservé à l'administrateur" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Nouveau frais" })).toHaveCount(0);
      await expect(page.getByText("Frais de stage")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Paramètres" })).toHaveCount(0);
      await capture(page, DOSSIER, "UC02-12-01-secretariat-refuse");
    });

    await test.step("2. La page ne transmet aucun frais au navigateur", async () => {
      const html = await (await page.request.get("/app/parametres/frais")).text();
      expect(html).not.toContain("Frais de stage");
      expect(html).not.toContain("Nouveau frais");
    });
  });
});

test.describe("UC02-12 : l'administrateur se trompe en créant un frais", () => {
  test.use({ storageState: SESSIONS.admin });

  test("libellé manquant, montant nul ou décimal, aucune classe, année terminée", async ({ page }) => {
    const dialogue = page.getByRole("dialog", { name: "Nouveau frais" });
    const creer = dialogue.getByRole("button", { name: /^Créer le frais/ });

    await test.step("3. Libellé vide : le bouton « Créer le frais » reste grisé, avec la raison", async () => {
      await page.goto("/app/parametres/frais");
      await expect(page.getByText(ADMIN)).toBeVisible();
      await page.getByRole("button", { name: "Nouveau frais" }).first().click();
      await dialogue.getByLabel("Montant par étudiant (Ar)").fill("15000");
      await dialogue.getByRole("checkbox", { name: "IF 1re année" }).check();
      await expect(creer).toBeDisabled();
      await expect(dialogue.getByText("Indiquez le libellé du frais.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-12-02-refus-libelle");
    });

    await test.step("4. Montant nul ou avec décimale : « Saisissez le montant. », bouton grisé", async () => {
      await dialogue.getByLabel("Libellé").fill("Frais de test");
      await dialogue.getByLabel("Montant par étudiant (Ar)").fill("0");
      await expect(dialogue.getByText("Saisissez le montant.")).toBeVisible();
      await expect(creer).toBeDisabled();
      await capture(page, DOSSIER, "UC02-12-03-refus-montant-nul");
      await dialogue.getByLabel("Montant par étudiant (Ar)").fill("15000,50");
      await dialogue.getByLabel("Libellé").click();
      await expect(dialogue.getByText("Saisissez le montant.")).toBeVisible();
      await expect(creer).toBeDisabled();
    });

    await test.step("5. Aucune classe cochée : « Cochez au moins une classe. », bouton grisé", async () => {
      await dialogue.getByLabel("Montant par étudiant (Ar)").fill("15000");
      await dialogue.getByRole("checkbox", { name: "IF 1re année" }).uncheck();
      await expect(dialogue.getByText("Cochez au moins une classe.")).toBeVisible();
      await expect(creer).toBeDisabled();
      await capture(page, DOSSIER, "UC02-12-04-refus-classe");
      await dialogue.getByRole("button", { name: "Annuler" }).click();
      await expect(dialogue).toBeHidden();
    });

    await test.step("6. Année 2025-2026 (terminée) : aucun mois à venir, pas de bouton « Nouveau frais »", async () => {
      await page.getByRole("combobox", { name: "Année scolaire" }).click();
      await page.getByRole("option", { name: /^2025-2026/ }).click();
      await expect(page.getByText("L'année 2025-2026 est terminée : plus aucun mois à venir pour un frais.")).toBeVisible();
      await expect(page.getByText("Aucun frais n'a été ajouté pour cette année.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Nouveau frais" })).toHaveCount(0);
      await capture(page, DOSSIER, "UC02-12-05-annee-terminee");
    });
  });
});

test.describe("UC02-12 : le frais payé ne se supprime pas, le frais impayé se modifie puis se supprime", () => {
  test.use({ storageState: SESSIONS.admin });

  test("verrou, modification du montant, suppression", async ({ page }) => {
    await test.step("7. Frais d'examen semestriel (déjà encaissé) : pas de bouton « Supprimer », le motif se lit", async () => {
      await page.goto("/app/parametres/frais");
      const examen = ligneParametre(page, /Frais d'examen semestriel/);
      await expect(examen.getByRole("button", { name: /^Supprimer le frais/ })).toHaveCount(0);
      await examen.getByRole("button", { name: "Pourquoi certaines actions ne sont pas proposées" }).click();
      await expect(
        page.getByText("Ce frais a déjà été payé, même en partie ou par un paiement annulé : il ne peut plus être supprimé.").first(),
      ).toBeVisible();
      await capture(page, DOSSIER, "UC02-12-06-motif-supprimer");
      await page.keyboard.press("Escape");
    });

    await test.step("8. Frais de stage (jamais payé) : modifier le montant à 20 000 Ar", async () => {
      await page.getByRole("button", { name: "Modifier le frais Frais de stage" }).click();
      const modification = page.getByRole("dialog", { name: "Modifier « Frais de stage »" });
      await modification.getByLabel("Montant par étudiant (Ar)").fill("20000");
      await modification.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Frais « Frais de stage » modifié : 20 000 Ar pour 3 étudiants.").first()).toBeVisible();
      await expect(ligneParametre(page, /Frais de stage/)).toContainText(/60\s000\sAr/);
      await capture(page, DOSSIER, "UC02-12-07-montant-modifie");
    });

    await test.step("9. La fiche de Hery montre le nouveau montant : il lui reste 20 000 Ar", async () => {
      await page.goto("/app/etudiants");
      await page.getByRole("row").filter({ hasText: "IF-2026-0004" }).getByRole("link").first().click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("RANDRIANTSOA");
      await expect(page.getByText(montantRegex(20_000)).first()).toBeVisible();
      await capture(page, DOSSIER, "UC02-12-08-fiche-montant-modifie");
    });

    await test.step("10. Supprimer le frais de stage : la confirmation, puis la fiche n'en porte plus", async () => {
      await page.goto("/app/parametres/frais");
      await page.getByRole("button", { name: "Supprimer le frais Frais de stage" }).click();
      const confirmation = page.getByRole("alertdialog");
      await expect(confirmation).toContainText("Supprimer le frais « Frais de stage » ?");
      await expect(confirmation).toContainText("Il disparaît de la fiche des 3 étudiants concernés. Personne ne l'a encore payé.");
      await capture(page, DOSSIER, "UC02-12-09-confirmer-suppression");
      await confirmation.getByRole("button", { name: "Supprimer le frais" }).click();
      await expect(page.getByText("Frais « Frais de stage » supprimé.")).toBeVisible();
      await expect(page.getByText("1 frais pour l'année 2026-2027.")).toBeVisible();
      await expect(ligneParametre(page, /Frais de stage/)).toHaveCount(0);
      await capture(page, DOSSIER, "UC02-12-10-frais-supprime");
      await page.goto("/app/etudiants");
      await page.getByRole("row").filter({ hasText: "IF-2026-0004" }).getByRole("link").first().click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("RANDRIANTSOA");
      await expect(page.getByText("Frais de stage")).toHaveCount(0);
      await expect(page.getByText("Aucune échéance impayée").or(page.getByText(/Reste à payer/)).first()).toBeVisible();
      await capture(page, DOSSIER, "UC02-12-11-fiche-sans-frais");
    });
  });
});
