import { test, expect } from "./outils";
import {
  attendreFinDefilement,
  bloquerServicesExternes,
  captureEcran,
  contraste,
  contrasteSurPhoto,
  enMobile,
} from "./UC14-aides";

test.use({ storageState: { cookies: [], origins: [] } });

test("UC14-05 accessibilité visible de la landing", async ({ page }) => {
  await bloquerServicesExternes(page);
  await page.goto("/");

  await test.step("1. Lien d'évitement au clavier", async () => {
    await page.keyboard.press("Tab");
    const lien = page.getByRole("link", { name: "Aller au contenu" });
    await expect(lien).toBeFocused();
    await expect(lien).toBeInViewport({ ratio: 1 });
    await captureEcran(page, "UC14-05-01-lien-evitement");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenu$/);
    await page.keyboard.press("Tab");
    // Après le saut, le focus repart dans le contenu, pas dans l'en-tête.
    await expect(page.getByRole("link", { name: "Découvrir les filières" })).toBeFocused();
  });

  await test.step("2. Le focus est visible sur les liens et boutons", async () => {
    await page.goto("/");
    const cible = page.getByRole("banner").getByRole("link", { name: "Se connecter" });
    for (let i = 0; i < 12 && !(await cible.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(cible).toBeFocused();
    const style = await cible.evaluate((e) => {
      const s = getComputedStyle(e);
      return { contour: s.outlineStyle, largeur: s.outlineWidth, ombre: s.boxShadow };
    });
    expect(style.contour !== "none" || style.ombre !== "none").toBe(true);
    test.info().annotations.push({ type: "focus Se connecter", description: JSON.stringify(style) });
    await captureEcran(page, "UC14-05-02-focus-se-connecter");
  });

  if (enMobile()) {
    await test.step("3. Menu mobile au clavier", async () => {
      const bouton = page.getByRole("button", { name: "Ouvrir le menu" });
      await bouton.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await captureEcran(page, "UC14-05-03-menu-clavier");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(bouton).toBeFocused();
      const boite = (await bouton.boundingBox())!;
      expect(Math.min(boite.width, boite.height)).toBeGreaterThanOrEqual(24);
    });
  }

  await test.step("4. Repères, titres et langue", async () => {
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const titres = await page.getByRole("heading").evaluateAll((hs) => hs.map((h) => `${h.tagName} ${h.textContent?.trim()}`));
    test.info().annotations.push({ type: "titres", description: titres.join(" | ") });
    // Aucun saut de niveau (H1 → H3 sans H2).
    const niveaux = titres.map((t) => Number(t[1]));
    for (let i = 1; i < niveaux.length; i++) expect(niveaux[i] - niveaux[i - 1]).toBeLessThanOrEqual(1);
    const viewport = await page.locator('head meta[name="viewport"]').getAttribute("content");
    expect(viewport).not.toMatch(/user-scalable=no|maximum-scale=1(\.0)?(,|$)/);
  });

  await test.step("5. Toutes les images ont un texte alternatif", async () => {
    await page.goto("/#galerie");
    await attendreFinDefilement(page);
    const images = await page.locator("img").evaluateAll((ims) =>
      ims.map((i) => ({ alt: i.getAttribute("alt"), decoratif: i.getAttribute("alt") === "", parent: i.closest("button")?.getAttribute("aria-label") ?? null })),
    );
    expect(images.length).toBeGreaterThan(10);
    for (const i of images) expect(i.alt).not.toBeNull();
    // Une image sans alt texte doit être une vignette dans un bouton qui porte son propre nom.
    for (const i of images.filter((x) => x.decoratif)) expect(i.parent).not.toBeNull();
    test.info().annotations.push({
      type: "alt",
      description: JSON.stringify(images.filter((x) => !x.decoratif).map((x) => x.alt)),
    });
    await expect(page.getByRole("img", { name: "Étudiants en tenue de soins posant en extérieur" })).toHaveCount(1);
  });

  await test.step("6. Contrastes du texte", async () => {
    await page.goto("/");
    const mesures: Record<string, number> = {};
    const mesure = async (nom: string, l: ReturnType<typeof page.locator>, minimum = 4.5) => {
      const r = await contraste(l);
      mesures[nom] = r.ratio;
      expect.soft(r.ratio, `${nom} (${r.couleur} sur ${r.fond})`).toBeGreaterThanOrEqual(minimum);
    };
    if (!enMobile()) await mesure("lien de navigation", page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link").first());
    await mesure("bandeau d'agrément (titre)", page.getByText("Établissement agréé par le ministère"));
    await mesure("bandeau d'agrément (arrêté)", page.getByText(/^Arrêté N° 04460\/2011-MESupRes · Renouvellement/));
    await mesure("présentation", page.locator("#institut p").first());
    await mesure("filières (texte)", page.locator("#filieres article p").first());
    await mesure("pastille Code SF", page.getByText("Code SF"));
    await mesure("agréments (année)", page.locator("#agrements li span").first());
    await mesure("agréments (objet)", page.locator("#agrements li p").nth(1));
    await mesure("contact (introduction)", page.locator("#contact > div > div > p").first());
    await mesure("contact (libellé Adresse)", page.locator("#contact dt").first());
    await mesure("contact (« À compléter »)", page.locator("#contact dd span").first());
    await mesure("formulaire (étiquette)", page.getByText("Nom et prénom *"));
    await mesure("formulaire (aide)", page.getByText("Les champs marqués * sont obligatoires."));
    await mesure("bouton Envoyer", page.getByRole("button", { name: "Envoyer le message" }));
    await mesure("bouton Découvrir les filières", page.getByRole("link", { name: "Découvrir les filières" }));
    await mesure("bouton Se connecter", page.getByRole("banner").getByRole("link", { name: "Se connecter" }));
    await mesure("pied de page (lien)", page.getByRole("contentinfo").getByRole("link", { name: "Galerie" }));
    await mesure("pied de page (« à compléter »)", page.getByRole("contentinfo").getByText("Téléphone à compléter"));
    await mesure("pied de page (mention d'arrêté)", page.getByText("Établissement autorisé par arrêté"));

    // Texte blanc sur la photo d'ouverture (voile en dégradé) : mesuré sur le pixel de fond le plus clair.
    mesures["ouverture : titre"] = await contrasteSurPhoto(page, page.getByRole("heading", { level: 1 }), 1);
    mesures["ouverture : paragraphe"] = await contrasteSurPhoto(page, page.locator("main section").first().locator("p"), 0.85);
    expect.soft(mesures["ouverture : titre"], "titre de l'ouverture sur la photo").toBeGreaterThanOrEqual(3);
    expect.soft(mesures["ouverture : paragraphe"], "paragraphe de l'ouverture sur la photo").toBeGreaterThanOrEqual(4.5);
    console.log(`CONTRASTES ${enMobile() ? "mobile" : "ordinateur"} ${JSON.stringify(mesures)}`);
    await captureEcran(page, "UC14-05-06-ouverture");
  });

  await test.step("7. Formulaire : erreurs reliées aux champs, focus après un refus", async () => {
    await page.goto("/#contact");
    await attendreFinDefilement(page);
    const formulaire = page.locator("#contact form");
    await formulaire.getByRole("button", { name: "Envoyer le message" }).click();
    await expect(formulaire.getByRole("alert")).toBeVisible();
    for (const [champ, id] of [["Nom et prénom *", "c-nom-err"], ["Téléphone *", "c-tel-err"], ["Message *", "c-message-err"]] as const) {
      await expect(formulaire.getByLabel(champ)).toHaveAttribute("aria-describedby", id);
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    const focus = await page.evaluate(() => `${document.activeElement?.tagName}#${document.activeElement?.id}`);
    console.log(`FOCUS après refus ${enMobile() ? "mobile" : "ordinateur"} : ${focus}`);
    // Refus anti-robot seul : aucun rôle alert, rien d'annoncé aux lecteurs d'écran.
    await formulaire.getByLabel("Nom et prénom *").fill("RAKOTOMALALA Hanitra");
    await formulaire.getByLabel("Téléphone *").fill("034 00 000 12");
    await formulaire.getByLabel("Message *").fill("Bonjour, quels sont les frais d'inscription ?");
    await formulaire.getByRole("button", { name: "Envoyer le message" }).click();
    await expect(formulaire.getByText("La vérification anti-robot a échoué. Cochez la case puis réessayez.")).toBeVisible();
    const annonce = await formulaire.getByText("La vérification anti-robot a échoué").evaluate((e) => ({
      role: e.getAttribute("role"),
      live: e.closest("[aria-live]")?.getAttribute("aria-live") ?? null,
    }));
    console.log(`ANNONCE refus anti-robot : ${JSON.stringify(annonce)}`);
  });
});
