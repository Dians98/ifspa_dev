import { choisirEtudiant, montantRecu } from "./aides";
import { DOSSIER_UC10 as DOSSIER } from "./aides-admissions";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1800 } });

async function ouvrirFiche(page: import("@playwright/test").Page, nom: string) {
  await page.goto("/app/etudiants");
  await page.getByRole("link", { name: new RegExp(nom) }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nom);
}

test("UC10-02 : après le passage, les fiches et le guichet montrent les deux années", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. La liste des étudiants : niveaux et années après le passage", async () => {
    await page.goto("/app/etudiants");
    const liste = page.getByRole("table");
    const ligne = (matricule: string) => liste.getByRole("row").filter({ hasText: matricule });
    await expect(ligne("IF-2025-0001")).toContainText("2e année");
    await expect(ligne("IF-2025-0001")).toContainText("2026-2027");
    await expect(ligne("IF-2025-0002")).toContainText("2e année");
    await expect(ligne("IF-2025-0003")).toContainText("2e année");
    await expect(ligne("IF-2025-0004")).toContainText("1re année (redoublant)");
    await expect(ligne("IF-2025-0004")).toContainText("2026-2027");
    await expect(ligne("SF-2025-0001")).toContainText("2025-2026");
    await expect(ligne("IF-2026-0001")).toContainText("1re année");
    await capture(page, DOSSIER, "UC10-02-01-liste-etudiants");
  });

  await test.step("2. Un admis : RAKOTOMALALA Voahirana, deux années à payer, même matricule", async () => {
    await ouvrirFiche(page, "RAKOTOMALALA Voahirana");
    await expect(page.getByText("IF-2025-0001", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("2e année · 2026-2027")).toBeVisible();
    await expect(page.getByText("Reste à payer", { exact: true })).toBeVisible();
    await expect(page.getByText(/1\s800\s000\sAr/).first()).toBeVisible();
    await expect(page.getByText(/900\s000\sAr/).first()).toBeVisible();
    await expect(page.getByText("Toutes années confondues")).toBeVisible();
    const grille2026 = page.getByRole("heading", { name: "Écolage 2026-2027 · 2e année" });
    const grille2025 = page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" });
    await expect(grille2026).toBeVisible();
    await expect(grille2025).toBeVisible();
    await capture(page, DOSSIER, "UC10-02-02-fiche-admis");
  });

  await test.step("3. Son parcours : deux lignes, 2026-2027 en cours et 2025-2026 admis", async () => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.getByRole("tab", { name: /Parcours/ }).click();
    await expect(page.getByText("Entrée en 2025-2026. Le matricule IF-2025-0001 reste le même pendant toute la scolarité.")).toBeVisible();
    const parcours = page.getByRole("tabpanel");
    await expect(parcours).toContainText("2026-2027");
    await expect(parcours).toContainText("2e année");
    await expect(parcours).toContainText("En cours");
    await expect(parcours).toContainText("2025-2026");
    await expect(parcours).toContainText("1re année");
    await expect(parcours).toContainText("Admis");
    await capture(page, DOSSIER, "UC10-02-03-parcours-admis");
  });

  await test.step("4. Un redoublant : RANDRIAMAHEFA Solofo, même niveau, même matricule", async () => {
    await page.setViewportSize({ width: 1440, height: 1800 });
    await ouvrirFiche(page, "RANDRIAMAHEFA Solofo");
    await expect(page.getByText("IF-2025-0004", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1re année (redoublant) · 2026-2027")).toBeVisible();
    await expect(page.getByText("Redoublant", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Écolage 2026-2027 · 1re année/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" })).toBeVisible();
    await capture(page, DOSSIER, "UC10-02-04-fiche-redoublant");
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.getByRole("tab", { name: /Parcours/ }).click();
    const parcours = page.getByRole("tabpanel");
    await expect(parcours).toContainText("1re année (redoublant)");
    await expect(parcours).toContainText("Redouble");
    await capture(page, DOSSIER, "UC10-02-04-parcours-redoublant");
  });

  await test.step("5. Au guichet : l'impayé 2025-2026 est coché d'office, 2026-2027 reste à venir", async () => {
    await page.setViewportSize({ width: 1440, height: 1800 });
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, { nom: "RASOANAIVO" });
    await expect(page.getByText(/Reste à payer :\s*1\s800\s000\sAr, dont\s*900\s000\sAr\s*en retard/)).toBeVisible();
    await expect(page.getByText(/Année 2025-2026 · 1re année/)).toBeVisible();
    await expect(page.getByText(/Année 2026-2027 · 2e année/)).toBeVisible();
    await expect(montantRecu(page)).toHaveValue(/900\s?000/);
    await expect(page.getByText("Droits d'inscription → Juillet 2026 · 11 échéances soldées · Espèces")).toBeVisible();
    await capture(page, DOSSIER, "UC10-02-05-guichet-impayes-precedents");
  });
});
