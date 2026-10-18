import { test, expect } from "./outils";
import { SESSIONS } from "./outils";
import { captureEcran, bloquerServicesExternes } from "./UC14-aides";

// L'adresse publique est figée au build (NEXT_PUBLIC_APP_URL) : sur ce build de recette, c'est celle du .env.
const SITE = "http://localhost:3100";

test.describe("visiteur sans compte", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("UC14-04 métadonnées, robots.txt, sitemap.xml, pages non indexées", async ({ page }) => {
    await bloquerServicesExternes(page);
    const meta = (nom: string) =>
      page.locator(`head meta[name="${nom}"], head meta[property="${nom}"]`).first().getAttribute("content");

    await test.step("1. Métadonnées de l'accueil", async () => {
      const reponse = await page.goto("/");
      expect(reponse?.status()).toBe(200);
      await expect(page).toHaveTitle("IFSPA — Institut de Formation Supérieur des Paramédicaux Atsinanana");
      expect(await meta("description")).toBe(
        "Établissement supérieur privé de formation paramédicale à Toamasina : filières Infirmier(e)s et Sage-femmes, domaine « Science de la Santé ».",
      );
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute("href", SITE);
      expect(await meta("viewport")).toContain("width=device-width");
      // La landing doit rester indexable : aucune directive robots.
      await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
      expect(await meta("og:type")).toBe("website");
      expect(await meta("og:locale")).toBe("fr_FR");
      expect(await meta("og:site_name")).toBe("IFSPA");
      expect(await meta("og:title")).toBe("IFSPA — Institut de Formation Supérieur des Paramédicaux Atsinanana");
      expect(await meta("og:description")).toContain("Établissement supérieur privé de formation paramédicale");
      // Constat : pas d'og:url (la canonique suffit aux moteurs).
      await expect(page.locator('head meta[property="og:url"]')).toHaveCount(0);
      // Constat : pas d'image de partage (STATUS.md : « à faire avec les vraies photos »).
      await expect(page.locator('head meta[property="og:image"]')).toHaveCount(0);
      const h1 = await page.getByRole("heading", { level: 1 }).count();
      expect(h1).toBe(1);
    });

    await test.step("2. Données structurées", async () => {
      const json = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
      expect(json["@type"]).toBe("EducationalOrganization");
      expect(json.name).toBe("Institut de Formation Supérieur des Paramédicaux Atsinanana");
      expect(json.alternateName).toBe("IFSPA");
      expect(json.address.addressLocality).toBe("Toamasina");
      expect(json.address.addressRegion).toBe("Atsinanana");
      expect(json.address.addressCountry).toBe("MG");
      // Coordonnées non saisies : omises plutôt qu'inventées.
      expect(json.telephone).toBeUndefined();
      expect(json.email).toBeUndefined();
      test.info().annotations.push({ type: "json-ld", description: JSON.stringify(json) });
    });

    await test.step("3. robots.txt", async () => {
      const texte = await (await page.request.get("/robots.txt")).text();
      expect(texte).toContain("User-Agent: *");
      expect(texte).toContain("Allow: /");
      expect(texte).toContain("Disallow: /app/");
      expect(texte).toContain("Disallow: /api/");
      expect(texte).toContain(`Sitemap: ${SITE}/sitemap.xml`);
      expect(texte).not.toMatch(/Disallow: \/connexion/);
      test.info().annotations.push({ type: "robots.txt", description: texte });
      await page.goto("/robots.txt");
      await captureEcran(page, "UC14-04-03-robots-txt");
    });

    await test.step("4. sitemap.xml", async () => {
      const reponse = await page.request.get("/sitemap.xml");
      expect(reponse.status()).toBe(200);
      const xml = await reponse.text();
      expect(xml).toContain(`<loc>${SITE}/</loc>`);
      expect(xml.match(/<url>/g)?.length).toBe(1);
      test.info().annotations.push({ type: "sitemap.xml", description: xml });
      await page.goto("/sitemap.xml");
      await captureEcran(page, "UC14-04-04-sitemap-xml");
    });

    await test.step("5. /connexion est exclue des moteurs", async () => {
      await page.goto("/connexion");
      await expect(page).toHaveTitle("Connexion · IFSPA");
      expect(await meta("robots")).toBe("noindex, nofollow");
      await captureEcran(page, "UC14-04-05-connexion");
    });

    await test.step("6. /app sans connexion renvoie à /connexion", async () => {
      const reponse = await page.request.get("/app/dashboard", { maxRedirects: 0 });
      expect([302, 303, 307, 308]).toContain(reponse.status());
      expect(reponse.headers()["location"]).toContain("/connexion?retour=%2Fapp%2Fdashboard");
      await page.goto("/app/dashboard");
      await expect(page).toHaveURL(/\/connexion\?retour=%2Fapp%2Fdashboard$/);
      await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
      await captureEcran(page, "UC14-04-06-app-sans-session");
    });

    await test.step("7. Adresse inconnue : page 404", async () => {
      const reponse = await page.goto("/cette-page-n-existe-pas");
      expect(reponse?.status()).toBe(404);
      await captureEcran(page, "UC14-04-07-page-introuvable");
    });
  });
});

test.describe("secrétariat connecté", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("UC14-04b une page de l'espace connecté porte noindex", async ({ page }) => {
    await page.goto("/app/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await captureEcran(page, "UC14-04-08-app-noindex");
  });
});
