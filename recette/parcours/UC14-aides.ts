import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./outils";

export const DOSSIER = "UC14-landing";
const RACINE = path.resolve(__dirname, "..");

export const enMobile = () => test.info().project.name === "mobile";

/** Capture de la fenêtre seule (pas de la page entière), suffixée `-mobile` sur le projet mobile. */
export async function captureEcran(page: Page, nom: string) {
  const suffixe = enMobile() ? "-mobile" : "";
  await page.screenshot({
    path: path.join(RACINE, "scenarios", DOSSIER, "captures", `${nom}${suffixe}.png`),
    animations: "disabled",
  });
}

/** Sur mobile, les liens de navigation sont dans un tiroir à ouvrir d'abord. */
export async function navigation(page: Page): Promise<Locator> {
  if (enMobile()) {
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    const tiroir = page.getByRole("navigation", { name: "Navigation mobile" });
    await expect(tiroir).toBeVisible();
    return tiroir;
  }
  return page.getByRole("navigation", { name: "Navigation principale" });
}

/** Le défilement vers une ancre est animé : on attend que la page s'arrête. */
export async function attendreFinDefilement(page: Page) {
  let precedent = -1;
  await expect
    .poll(
      async () => {
        const y = await page.evaluate(() => Math.round(window.scrollY));
        const stable = y === precedent;
        precedent = y;
        return stable;
      },
      { intervals: [200], timeout: 10_000 },
    )
    .toBe(true);
}

/** Bloque le script Cloudflare Turnstile : la recette n'appelle aucun service réel. */
export async function bloquerServicesExternes(page: Page) {
  await page.route(/challenges\.cloudflare\.com/, (route) => route.abort());
}

export type Rapport = { texte: string; couleur: string; fond: string; ratio: number };

/** Contraste WCAG du texte d'un élément contre le premier fond opaque rencontré en remontant. */
export async function contraste(cible: Locator): Promise<Rapport> {
  return cible.evaluate((el) => {
    type Couleur = { r: number; g: number; b: number; a: number };
    // Le navigateur renvoie parfois oklab()/oklch() : un canevas 1 px les convertit en RGBA.
    const toile = document.createElement("canvas");
    toile.width = toile.height = 1;
    const ctx = toile.getContext("2d", { willReadFrequently: true })!;
    const lire = (c: string): Couleur => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const melange = (d: Couleur, f: Couleur): Couleur => ({
      r: d.r * d.a + f.r * (1 - d.a),
      g: d.g * d.a + f.g * (1 - d.a),
      b: d.b * d.a + f.b * (1 - d.a),
      a: 1,
    });
    const pile: Couleur[] = [];
    for (let n: HTMLElement | null = el as HTMLElement; n; n = n.parentElement) {
      const c = lire(getComputedStyle(n).backgroundColor);
      if (c.a > 0) pile.push(c);
      if (c.a === 1) break;
    }
    let fond: Couleur = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of pile.reverse()) fond = melange(c, fond);
    const texte = melange(lire(getComputedStyle(el).color), fond);
    const lum = (c: Couleur) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const [a, b] = [lum(texte), lum(fond)].sort((x, y) => y - x);
    const h = (c: Couleur) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    return {
      texte: (el.textContent ?? "").trim().slice(0, 40),
      couleur: h(texte),
      fond: h(fond),
      ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100,
    };
  });
}

/**
 * Contraste d'un texte posé sur la photo : on rend le texte transparent, on photographie la zone
 * et on compare le texte (blanc, opacité donnée) au pixel de fond le plus clair (99e centile).
 */
export async function contrasteSurPhoto(page: Page, cible: Locator, opaciteTexte: number): Promise<number> {
  await cible.evaluate((el) => ((el as HTMLElement).style.color = "transparent"));
  const png = await cible.screenshot({ animations: "disabled" });
  await cible.evaluate((el) => ((el as HTMLElement).style.color = ""));
  return page.evaluate(
    async ([base64, opacite]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const toile = document.createElement("canvas");
      toile.width = img.width;
      toile.height = img.height;
      const ctx = toile.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, img.width, img.height).data;
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = (r: number, g: number, bl: number) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
      const pixels: { l: number; r: number; g: number; b: number }[] = [];
      for (let i = 0; i < px.length; i += 4) pixels.push({ l: lum(px[i], px[i + 1], px[i + 2]), r: px[i], g: px[i + 1], b: px[i + 2] });
      pixels.sort((x, y) => x.l - y.l);
      const clair = pixels[Math.floor(pixels.length * 0.99)];
      const o = opacite as number;
      const mel = (v: number) => 255 * o + v * (1 - o);
      const lt = lum(mel(clair.r), mel(clair.g), mel(clair.b));
      const fond = clair.l;
      const [a, b] = [lt, fond].sort((x, y) => y - x);
      return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
    },
    [png.toString("base64"), opaciteTexte] as const,
  );
}
