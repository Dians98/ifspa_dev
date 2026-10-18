import { capture, expect, SESSIONS, test } from "./outils";
import { DOSSIER, PAGE_UTILISATEURS, verifierUtilisateur } from "./aides-utilisateurs";

const ROUTES_ADMIN = [
  { methode: "GET", chemin: "/api/auth/admin/list-users" },
  { methode: "POST", chemin: "/api/auth/admin/set-role", corps: { userId: "x", role: "admin" } },
  { methode: "POST", chemin: "/api/auth/admin/ban-user", corps: { userId: "x" } },
  { methode: "POST", chemin: "/api/auth/admin/set-user-password", corps: { userId: "x", newPassword: "MotDePasse-123" } },
] as const;

test.describe("secrétariat", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("UC03-06 (secrétariat) : l'écran Utilisateurs lui est fermé", async ({ page }) => {
    await test.step("1. Le menu du secrétariat n'a pas de rubrique Paramètres", async () => {
      await page.goto("/app/dashboard");
      await verifierUtilisateur(page, "Hanitra RAKOTO", "Secrétariat");
      await expect(page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Paramètres" })).toHaveCount(0);
      await capture(page, DOSSIER, "UC03-06-01-menu-secretariat");
    });

    await test.step("2. Ouvrir /app/parametres/utilisateurs : « Accès réservé à l'administrateur », aucun compte affiché", async () => {
      await page.goto(PAGE_UTILISATEURS);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { name: "Accès réservé à l'administrateur" })).toBeVisible();
      await expect(main.getByText("Les paramètres (filières, années scolaires, tarifs et comptes utilisateurs) ne peuvent être modifiés que par un administrateur. Si un réglage doit changer, adressez-vous à lui.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Nouvel utilisateur" })).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Utilisateurs" })).toHaveCount(0);
      await verifierUtilisateur(page, "Hanitra RAKOTO", "Secrétariat");
      await capture(page, DOSSIER, "UC03-06-02-acces-reserve");
    });

    await test.step("3. Aucun courriel de compte n'est transmis à la page (ni liste, ni action)", async () => {
      const reponse = await page.request.get(PAGE_UTILISATEURS);
      const html = await reponse.text();
      expect(html).not.toContain("admin@ifspa.mg");
      expect(html).not.toContain("Réinitialiser le mot de passe");
    });

    await test.step("4. « Retour au tableau de bord » ramène à l'espace de travail", async () => {
      await page.getByRole("link", { name: "Retour au tableau de bord" }).click();
      await page.waitForURL("**/app/dashboard");
      await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    });

    await test.step("5. Les routes d'administration de Better Auth sont fermées (404) : aucun contournement par l'URL", async () => {
      for (const r of ROUTES_ADMIN) {
        const reponse = r.methode === "GET"
          ? await page.request.get(r.chemin)
          : await page.request.post(r.chemin, { data: "corps" in r ? r.corps : {} });
        expect(reponse.status(), `${r.methode} ${r.chemin}`).toBe(404);
      }
    });
  });
});

test.describe("administrateur", () => {
  test.use({ storageState: SESSIONS.admin });

  test("UC03-06 (administrateur) : même l'administrateur ne passe pas par les routes fermées", async ({ page }) => {
    await test.step("6. Avec la session de l'administrateur, les mêmes routes répondent aussi 404", async () => {
      await page.goto(PAGE_UTILISATEURS);
      await verifierUtilisateur(page, "Administrateur IFSPA", "Administrateur");
      for (const r of ROUTES_ADMIN) {
        const reponse = r.methode === "GET"
          ? await page.request.get(r.chemin)
          : await page.request.post(r.chemin, { data: "corps" in r ? r.corps : {} });
        expect(reponse.status(), `${r.methode} ${r.chemin}`).toBe(404);
      }
      await expect(page.getByRole("button", { name: "Nouvel utilisateur" })).toBeVisible();
      await capture(page, DOSSIER, "UC03-06-03-admin-liste-intacte");
    });
  });
});
