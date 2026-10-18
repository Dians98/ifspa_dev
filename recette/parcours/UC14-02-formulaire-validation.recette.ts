import { test, expect, capture } from "./outils";
import { DOSSIER, attendreFinDefilement, bloquerServicesExternes, captureEcran } from "./UC14-aides";

test.use({ storageState: { cookies: [], origins: [] } });

test("UC14-02 le formulaire de contact refuse les saisies invalides", async ({ page }) => {
  await bloquerServicesExternes(page);
  await page.goto("/#contact");
  await attendreFinDefilement(page);
  const formulaire = page.locator("#contact form");
  const envoyer = formulaire.getByRole("button", { name: "Envoyer le message" });

  await test.step("1. Le formulaire vide", async () => {
    await expect(formulaire.getByRole("heading", { name: "Écrire au secrétariat" })).toBeVisible();
    await expect(formulaire.getByText("Les champs marqués * sont obligatoires.")).toBeVisible();
    for (const libelle of ["Nom et prénom *", "Téléphone *", "Courriel", "Objet *", "Message *"]) {
      await expect(formulaire.getByLabel(libelle)).toBeVisible();
    }
    await expect(formulaire.getByLabel("Objet *")).toHaveValue("Renseignements sur les inscriptions");
    await expect(formulaire.getByLabel("Téléphone *")).toHaveAttribute("placeholder", "034 00 000 00");
    await capture(page, DOSSIER, "UC14-02-01-formulaire-vide", formulaire);
  });

  await test.step("2. Envoyer sans rien remplir", async () => {
    await envoyer.click();
    await expect(formulaire.getByRole("alert")).toHaveText("Vérifiez les champs signalés.");
    await expect(formulaire.getByText("Indiquez votre nom.")).toBeVisible();
    await expect(formulaire.getByText("Indiquez un numéro de téléphone.")).toBeVisible();
    await expect(formulaire.getByText("Votre message est trop court.")).toBeVisible();
    await expect(formulaire.getByLabel("Nom et prénom *")).toHaveAttribute("aria-invalid", "true");
    await expect(formulaire.getByLabel("Courriel")).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Message envoyé")).toHaveCount(0);
    const focus = await page.evaluate(() => document.activeElement?.tagName + "#" + document.activeElement?.id);
    test.info().annotations.push({ type: "focus après refus", description: focus });
    await capture(page, DOSSIER, "UC14-02-02-champs-vides", formulaire);
  });

  await test.step("3. Saisies invalides dans chaque champ", async () => {
    await formulaire.getByLabel("Nom et prénom *").fill("A");
    await formulaire.getByLabel("Téléphone *").fill("abc12345");
    await formulaire.getByLabel("Courriel").fill("rakoto@");
    await formulaire.getByLabel("Objet *").selectOption("Frais de scolarité");
    await formulaire.getByLabel("Message *").fill("Bonjour");
    await envoyer.click();
    await expect(formulaire.getByRole("alert")).toHaveText("Vérifiez les champs signalés.");
    await expect(formulaire.getByText("Indiquez votre nom.")).toBeVisible();
    await expect(formulaire.getByText("Numéro de téléphone invalide.")).toBeVisible();
    await expect(formulaire.getByText("Adresse e-mail invalide.")).toBeVisible();
    await expect(formulaire.getByText("Votre message est trop court.")).toBeVisible();
    // Les saisies sont conservées après le refus.
    await expect(formulaire.getByLabel("Nom et prénom *")).toHaveValue("A");
    await expect(formulaire.getByLabel("Téléphone *")).toHaveValue("abc12345");
    await expect(formulaire.getByLabel("Courriel")).toHaveValue("rakoto@");
    // ANOMALIE constatée : l'objet choisi revient à la première option après un refus.
    await expect.soft(formulaire.getByLabel("Objet *")).toHaveValue("Frais de scolarité");
    await expect(formulaire.getByLabel("Message *")).toHaveValue("Bonjour");
    await capture(page, DOSSIER, "UC14-02-03-saisies-invalides", formulaire);
  });

  await test.step("4. Téléphone trop court", async () => {
    await formulaire.getByLabel("Téléphone *").fill("034 12");
    await envoyer.click();
    await expect(formulaire.getByText("Indiquez un numéro de téléphone.")).toBeVisible();
    await capture(page, DOSSIER, "UC14-02-04-telephone-court", formulaire);
  });

  await test.step("5. Message trop long", async () => {
    await formulaire.getByLabel("Nom et prénom *").fill("RAKOTOMALALA Hanitra");
    await formulaire.getByLabel("Téléphone *").fill("034 00 000 12");
    await formulaire.getByLabel("Courriel").fill("");
    await formulaire.getByLabel("Message *").fill("a".repeat(3001));
    await envoyer.click();
    await expect(formulaire.getByText("Message trop long (3 000 caractères maximum).")).toBeVisible();
    await expect(formulaire.getByText("Indiquez votre nom.")).toHaveCount(0);
    await formulaire.getByText("Message trop long (3 000 caractères maximum).").evaluate((el) => el.scrollIntoView({ block: "end" }));
    await attendreFinDefilement(page);
    await captureEcran(page, "UC14-02-05-message-trop-long");
  });

  await test.step("6. Rien n'est parti : aucun message de succès", async () => {
    await expect(page.getByText("Message envoyé")).toHaveCount(0);
    await expect(page.getByText("Merci, votre message a bien été envoyé.")).toHaveCount(0);
  });
});
