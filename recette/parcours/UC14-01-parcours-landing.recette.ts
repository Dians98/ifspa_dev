import { test, expect, capture } from "./outils";
import { DOSSIER, attendreFinDefilement, bloquerServicesExternes, captureEcran, enMobile, navigation } from "./UC14-aides";

test.use({ storageState: { cookies: [], origins: [] } });

const SECTIONS = [
  { lien: "L'institut", ancre: "institut", titre: "Un institut de formation au service de la santé en Atsinanana" },
  { lien: "Filières", ancre: "filieres", titre: "Nos filières" },
  { lien: "Galerie", ancre: "galerie", titre: "Galerie" },
  { lien: "Agréments", ancre: "agrements", titre: "Agréments officiels" },
  { lien: "Contact", ancre: "contact", titre: "Nous contacter" },
];

test("UC14-01 un visiteur parcourt la landing", async ({ page }) => {
  await bloquerServicesExternes(page);
  await test.step("1. Ouvrir le site", async () => {
    await page.goto("/");
    await expect(page).toHaveTitle("IFSPA — Institut de Formation Supérieur des Paramédicaux Atsinanana");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se former aux métiers paramédicaux à Toamasina");
    await expect(page.getByRole("link", { name: "Découvrir les filières" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nous contacter" }).first()).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Se connecter" })).toHaveAttribute("href", "/connexion");
    await captureEcran(page, "UC14-01-01-ouverture");
  });

  await test.step("2. Lire le bandeau d'agrément et la présentation", async () => {
    await expect(page.getByText("Établissement agréé par le ministère de l'Enseignement supérieur")).toBeVisible();
    await expect(page.getByText("Arrêté N° 04460/2011-MESupRes · Renouvellement du 3 avril 2024")).toBeVisible();
    await page.locator("#institut").scrollIntoViewIfNeeded();
    await attendreFinDefilement(page);
    await expect(page.getByRole("img", { name: "Écusson de l'Institut de Formation Supérieur des Paramédicaux Atsinanana" })).toBeVisible();
    await captureEcran(page, "UC14-01-02-presentation");
  });

  await page.goto("/");
  let numero = 3;
  for (const s of SECTIONS) {
    await test.step(`${numero}. Aller à « ${s.lien} » par le menu`, async () => {
      const nav = await navigation(page);
      if (enMobile() && s.ancre === "institut") await captureEcran(page, "UC14-01-03-menu-ouvert");
      await nav.getByRole("link", { name: s.lien }).click();
      await expect(page).toHaveURL(new RegExp(`#${s.ancre}$`));
      await attendreFinDefilement(page);
      const titre = page.getByRole("heading", { level: 2, name: s.titre });
      await expect(titre).toBeInViewport();
      // Le titre ne doit pas finir caché sous l'en-tête collant.
      const hauteurEnTete = (await page.getByRole("banner").boundingBox())!.height;
      expect((await titre.boundingBox())!.y).toBeGreaterThanOrEqual(hauteurEnTete - 1);
      await captureEcran(page, `UC14-01-${String(numero).padStart(2, "0")}-menu-${s.ancre}`);
    });
    numero += 1;
  }

  await test.step("8. Le contenu des filières et des agréments", async () => {
    await page.locator("#filieres").scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { level: 3, name: "Infirmier(e)s" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Sage-femmes" })).toBeVisible();
    await expect(page.getByText("Code IF")).toBeVisible();
    await expect(page.getByText("Code SF")).toBeVisible();
    const agrements = page.locator("#agrements");
    await agrements.scrollIntoViewIfNeeded();
    await expect(agrements.getByRole("listitem")).toHaveCount(4);
    await expect(agrements.getByText("Arrêté N° 056/2024/MESupRes/SG/DGES/SG")).toBeVisible();
    await capture(page, DOSSIER, "UC14-01-08-filieres", page.locator("#filieres"));
    await capture(page, DOSSIER, "UC14-01-08-agrements", agrements);
  });

  await test.step("9. Parcourir la galerie", async () => {
    await page.goto("/#galerie");
    await attendreFinDefilement(page);
    const galerie = page.locator("#galerie");
    await expect(galerie.getByText("1 / 8")).toBeVisible();
    await expect(galerie.getByText("Travaux pratiques : prise de la tension artérielle")).toBeVisible();
    await galerie.getByRole("button", { name: "Photo suivante" }).click();
    await expect(galerie.getByText("2 / 8")).toBeVisible();
    await expect(galerie.getByText("Simulation sur mannequin")).toBeVisible();
    await galerie.getByRole("button", { name: /Afficher la photo 5 : Gestes d'urgence/ }).click();
    await expect(galerie.getByText("5 / 8")).toBeVisible();
    await expect(galerie.getByText("Gestes d'urgence").first()).toBeVisible();
    await galerie.getByRole("button", { name: "Photo précédente" }).click();
    await expect(galerie.getByText("4 / 8")).toBeVisible();
    await galerie.getByRole("button", { name: /Afficher la photo 4/ }).evaluate((el) => el.scrollIntoView({ block: "end" }));
    await attendreFinDefilement(page);
    await captureEcran(page, "UC14-01-09-galerie");
  });

  await test.step("10. Boutons de l'ouverture", async () => {
    await page.goto("/");
    await page.getByRole("link", { name: "Découvrir les filières" }).click();
    await expect(page).toHaveURL(/#filieres$/);
    await attendreFinDefilement(page);
    await expect(page.getByRole("heading", { level: 2, name: "Nos filières" })).toBeInViewport();
    await page.goto("/");
    await page.getByRole("link", { name: "Nous contacter" }).first().click();
    await expect(page).toHaveURL(/#contact$/);
    await attendreFinDefilement(page);
    await expect(page.getByRole("heading", { level: 2, name: "Nous contacter" })).toBeInViewport();
    await captureEcran(page, "UC14-01-10-bouton-nous-contacter");
  });

  await test.step("11. Le pied de page", async () => {
    const pied = page.getByRole("contentinfo");
    await pied.scrollIntoViewIfNeeded();
    await attendreFinDefilement(page);
    for (const l of ["L'institut", "Filières", "Admission", "Galerie", "Agréments", "Contact"]) {
      await expect(pied.getByRole("link", { name: l, exact: true }).first()).toBeVisible();
    }
    await expect(pied.getByRole("link", { name: "Infirmier(e)s" })).toHaveAttribute("href", "#filieres");
    await expect(pied.getByRole("link", { name: "Sage-femmes" })).toHaveAttribute("href", "#filieres");
    const credit = pied.getByRole("link", { name: /Diano ANDRIANTSALAMA/ });
    await expect(credit).toHaveAttribute("href", "https://dians98.vercel.app/");
    await expect(credit).toHaveAttribute("target", "_blank");
    // Une coordonnée ou une devise non saisie n'apparaît pas : aucun « à compléter » visible du public.
    await expect(pied.getByText(/à compléter/i)).toHaveCount(0);
    await expect(pied.getByText("Plle 32/32, Station FJKM David Jones, Toamasina")).toBeVisible();
    await expect(pied.getByText("034 07 576 81")).toBeVisible();
    await expect(pied.getByText("Foi – Civisme – Performance")).toBeVisible();
    await captureEcran(page, "UC14-01-11-pied-de-page");
  });

  await test.step("12. Aller à la connexion et revenir au site", async () => {
    await page.goto("/");
    await page.getByRole("banner").getByRole("link", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await captureEcran(page, "UC14-01-12-connexion");
    await page.getByRole("link", { name: "Retour au site" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se former aux métiers paramédicaux à Toamasina");
  });

  await test.step("13. Le logo ramène à l'accueil", async () => {
    await page.goto("/#contact");
    await attendreFinDefilement(page);
    await page.getByRole("banner").getByRole("link", { name: /Logo de l'IFSPA/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  await test.step("14. Pas de débordement horizontal", async () => {
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(deborde).toBe(false);
  });
});
