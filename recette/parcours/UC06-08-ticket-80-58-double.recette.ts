import {
  boutonEncaisser,
  carte,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  grandEcran,
  impressions,
  recuEnregistre,
  testPoste as test,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC06-encaisser";
const E = ETUDIANTS.fanja;
// 80 mm et 58 mm en pixels CSS (96 dpi).
const LARGEUR_80 = 302.4;
const LARGEUR_58 = 219.2;

test("UC06-08 : le ticket en 80 mm, en 58 mm et avec le double de l'institut", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Encaisser 180 000 Ar : ticket 80 mm par défaut, monochrome, sans QR code", async () => {
    await page.goto("/app/encaisser");
    await expect(page.getByRole("radio", { name: "Rouleau 80 mm" })).toBeChecked();
    await choisirEtudiant(page, E);
    await carte(page, "Novembre 2025").click();
    await boutonEncaisser(page, 180_000).click();
    const { numero } = await recuEnregistre(page);
    await page.emulateMedia({ media: "print" });
    const tickets = page.getByRole("article", { name: new RegExp(`^Reçu ${numero}`) });
    await expect(tickets).toHaveCount(1);
    const ticket = tickets.first();
    const largeur = (await ticket.boundingBox())?.width ?? 0;
    expect(Math.abs(largeur - LARGEUR_80)).toBeLessThan(3);
    expect(await ticket.locator("canvas, svg").count()).toBe(0);
    expect(await ticket.locator("img").count()).toBe(1);
    const couleurs = await ticket.evaluate((el) => {
      const tous = [el, ...Array.from(el.querySelectorAll("*"))] as HTMLElement[];
      return tous
        .filter((n) => n.textContent?.trim() && n.children.length === 0)
        .map((n) => getComputedStyle(n).color)
        .filter((c, i, t) => t.indexOf(c) === i);
    });
    // Les contenus noirs sur fond blanc : seule la couleur noire est utilisée pour le texte (le bandeau ANNULÉ est blanc sur noir).
    expect(couleurs).toEqual(["rgb(0, 0, 0)"]);
    await expect(ticket).toContainText("Merci. Conservez ce reçu.");
    await capture(page, DOSSIER, "UC06-08-01-ticket-80mm", ticket);
    await finImpression(page);
  });

  await test.step("2. Choisir « Rouleau 58 mm » et « Imprimer aussi un double pour l'institut »", async () => {
    await page.getByRole("radio", { name: "Rouleau 58 mm" }).check();
    await page.getByRole("checkbox", { name: "Imprimer aussi un double pour l'institut" }).check();
    await expect(page.getByRole("radio", { name: "Rouleau 58 mm" })).toBeChecked();
    await capture(page, DOSSIER, "UC06-08-02-options");
  });

  await test.step("3. Encaisser 160 000 Ar : le ticket 58 mm et son double sortent ensemble", async () => {
    await choisirEtudiant(page, E);
    await carte(page, "Janvier 2026").click();
    const avant = await impressions(page);
    await boutonEncaisser(page, 160_000).click();
    const { numero } = await recuEnregistre(page);
    await expect.poll(() => impressions(page)).toBe(avant + 1);
    await page.emulateMedia({ media: "print" });
    const tickets = page.getByRole("article", { name: new RegExp(`^Reçu ${numero}`) });
    await expect(tickets).toHaveCount(2);
    await expect(tickets.nth(1)).toContainText("DOUBLE");
    await expect(tickets.nth(0)).not.toContainText("DOUBLE");
    const largeur = (await tickets.nth(0).boundingBox())?.width ?? 0;
    expect(Math.abs(largeur - LARGEUR_58)).toBeLessThan(3);
    await capture(page, DOSSIER, "UC06-08-03-ticket-58mm", tickets.nth(0));
    await capture(page, DOSSIER, "UC06-08-03-ticket-double", tickets.nth(1));
    await finImpression(page);
  });

  await test.step("4. « Réimprimer le ticket » relance l'impression", async () => {
    const avant = await impressions(page);
    await page.getByRole("button", { name: "Réimprimer le ticket" }).click();
    await expect.poll(() => impressions(page)).toBe(avant + 1);
    await grandEcran(page, 900);
    await capture(page, DOSSIER, "UC06-08-04-reimpression");
  });

  await test.step("5. Remettre les options par défaut du poste", async () => {
    await page.getByRole("radio", { name: "Rouleau 80 mm" }).check();
    await page.getByRole("checkbox", { name: "Imprimer aussi un double pour l'institut" }).uncheck();
    await expect(page.getByRole("radio", { name: "Rouleau 80 mm" })).toBeChecked();
  });
});
