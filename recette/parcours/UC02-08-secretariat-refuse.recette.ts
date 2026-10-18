import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";

test.use({ viewport: { width: 1440, height: 1300 }, storageState: SESSIONS.secretariat });

const TEXTE_REFUS =
  "Les paramètres (filières, années scolaires, tarifs et comptes utilisateurs) ne peuvent être modifiés que par un administrateur. Si un réglage doit changer, adressez-vous à lui.";

test("UC02-08 : le secrétariat n'accède ni aux filières, ni aux années, ni aux tarifs", async ({ page }) => {
  await test.step("1. Le menu du secrétariat n'a pas de rubrique Paramètres", async () => {
    await page.goto("/app/etudiants");
    const menu = page.getByRole("navigation").first();
    await expect(page.getByText("Hanitra RAKOTO")).toBeVisible();
    await expect(page.getByText("Secrétariat", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Paramètres" })).toHaveCount(0);
    await expect(menu.getByText("Administration")).toHaveCount(0);
    await capture(page, DOSSIER, "UC02-08-01-menu-secretariat");
  });

  for (const [n, adresse, onglet] of [
    [2, "/app/parametres/filieres", "Filières"],
    [3, "/app/parametres/annees", "Années scolaires"],
    [4, "/app/parametres/tarifs", "Tarifs"],
  ] as const) {
    await test.step(`${n}. Ouvrir ${adresse} : « Accès réservé à l'administrateur », sans onglets ni données`, async () => {
      await page.goto(adresse);
      await expect(page.getByRole("heading", { name: "Accès réservé à l'administrateur" })).toBeVisible();
      await expect(page.getByText(TEXTE_REFUS)).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Sections des paramètres" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: onglet, exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Ajouter une filière|Nouvelle année|Enregistrer/ })).toHaveCount(0);
      await expect(page.getByLabel(/Droits d'inscription, /)).toHaveCount(0);
      await capture(page, DOSSIER, `UC02-08-0${n}-acces-reserve-${onglet === "Années scolaires" ? "annees" : onglet.toLowerCase().replace("è", "e")}`);
    });
  }

  await test.step("5. La page des tarifs ne transmet aucun montant au navigateur", async () => {
    const reponse = await page.request.get("/app/parametres/tarifs");
    expect(reponse.status()).toBe(200);
    const html = await reponse.text();
    expect(html).not.toContain("Mensualité (Ar)");
    expect(html).not.toContain("Droits d'inscription, IF 1re année");
    expect(html).not.toContain("À saisir");
    const filieres = await (await page.request.get("/app/parametres/filieres")).text();
    expect(filieres).not.toContain("Ajouter une filière");
    expect(filieres).not.toContain("Étudiants actifs");
    expect(filieres).not.toContain("Modifier la filière");
  });

  await test.step("6. Retour au tableau de bord", async () => {
    await page.goto("/app/parametres/tarifs");
    await page.getByRole("link", { name: "Retour au tableau de bord" }).click();
    await expect(page).toHaveURL(/\/app\/dashboard$/);
  });
});
