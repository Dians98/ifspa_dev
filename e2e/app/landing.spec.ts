import { expect, test } from "@playwright/test";

test.describe("Landing publique", () => {
  test("affiche le titre, les sections et le lien de connexion", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Se former aux métiers paramédicaux à Toamasina");
    await expect(page.getByRole("heading", { name: "Galerie" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nous contacter" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Se connecter" }).first()).toHaveAttribute("href", "/connexion");
  });

  test("ne déborde pas horizontalement", async ({ page }) => {
    await page.goto("/");
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(deborde).toBe(false);
  });
});
