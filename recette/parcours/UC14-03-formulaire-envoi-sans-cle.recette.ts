import { test, expect, capture } from "./outils";
import { DOSSIER, attendreFinDefilement, bloquerServicesExternes } from "./UC14-aides";

test.use({ storageState: { cookies: [], origins: [] } });

// Le script Turnstile est bloqué : aucun jeton n'existe, donc aucun appel à Cloudflare ni à SMTP2GO ne part.
test("UC14-03 un message valide sans jeton anti-robot", async ({ page }) => {
  await bloquerServicesExternes(page);
  await page.goto("/#contact");
  await attendreFinDefilement(page);
  const formulaire = page.locator("#contact form");
  const envoyer = formulaire.getByRole("button", { name: "Envoyer le message" });
  const refus = "La vérification anti-robot a échoué. Cochez la case puis réessayez.";

  await test.step("1. Remplir un message complet", async () => {
    await formulaire.getByLabel("Nom et prénom *").fill("RAKOTOMALALA Hanitra");
    await formulaire.getByLabel("Téléphone *").fill("034 00 000 12");
    await formulaire.getByLabel("Courriel").fill("hanitra.rakotomalala@example.mg");
    await formulaire.getByLabel("Objet *").selectOption("Filière Sage-femmes");
    await formulaire
      .getByLabel("Message *")
      .fill("Bonjour, je souhaite connaître les pièces à fournir pour inscrire ma fille en première année.");
    await capture(page, DOSSIER, "UC14-03-01-formulaire-rempli", formulaire);
  });

  await test.step("2. Envoyer", async () => {
    await envoyer.click();
    await expect(formulaire.getByText(refus)).toBeVisible();
    await expect(page.getByText("Message envoyé")).toHaveCount(0);
    // Les champs ne sont pas en erreur : c'est la vérification anti-robot seule qui bloque.
    await expect(formulaire.getByLabel("Nom et prénom *")).not.toHaveAttribute("aria-invalid", "true");
    await expect(formulaire.getByRole("alert")).toHaveCount(0);
    await expect(formulaire.getByLabel("Nom et prénom *")).toHaveValue("RAKOTOMALALA Hanitra");
    await expect(formulaire.getByLabel("Message *")).toHaveValue(/pièces à fournir/);
    // ANOMALIE constatée : l'objet choisi revient à la première option après un refus.
    await expect.soft(formulaire.getByLabel("Objet *")).toHaveValue("Filière Sage-femmes");
    await capture(page, DOSSIER, "UC14-03-02-refus-anti-robot", formulaire);
  });

  await test.step("3. Réessayer : même refus, saisies conservées", async () => {
    await envoyer.click();
    await expect(formulaire.getByText(refus)).toBeVisible();
    await expect(formulaire.getByLabel("Téléphone *")).toHaveValue("034 00 000 12");
  });

  await test.step("4. Courriel facultatif et numéro international acceptés", async () => {
    await formulaire.getByLabel("Courriel").fill("");
    await formulaire.getByLabel("Téléphone *").fill("+261 34 00 000 12");
    await envoyer.click();
    await expect(formulaire.getByText(refus)).toBeVisible();
    await expect(formulaire.getByText("Numéro de téléphone invalide.")).toHaveCount(0);
    await expect(formulaire.getByText("Adresse e-mail invalide.")).toHaveCount(0);
    await capture(page, DOSSIER, "UC14-03-04-sans-courriel", formulaire);
  });
});
