import {
  bandeau,
  boutonEncaisser,
  carte,
  ETUDIANTS,
  finImpression,
  grandEcran,
  impressions,
  logoAffiche,
  montantRecu,
  recuEnregistre,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC06-encaisser";
const E = ETUDIANTS.mialy;

test("UC06-01 : un parent paie les droits et octobre en espèces", async ({ page }) => {
  test.setTimeout(90_000);

  await test.step("1. Ouvrir Encaisser", async () => {
    await page.goto("/app/encaisser");
    await expect(page.getByRole("heading", { level: 1, name: "Encaisser un paiement" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Rechercher l'étudiant/ })).toBeFocused();
    await expect(page.getByText("Les étudiants que vous venez d'encaisser apparaîtront ici.")).toBeVisible();
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await capture(page, DOSSIER, "UC06-01-01-guichet");
  });

  await test.step("2. Chercher l'étudiante par son nom", async () => {
    const recherche = page.getByRole("combobox", { name: /Rechercher l'étudiant/ });
    await recherche.fill("razafindrakoto");
    await expect(page.getByText("1 étudiant trouvé")).toBeVisible();
    await expect(page.getByRole("option", { name: new RegExp(`${E.nom} ${E.prenoms}`) })).toContainText("SF-2025-0001");
    await capture(page, DOSSIER, "UC06-01-02-recherche");
    await recherche.press("Enter");
  });

  await test.step("3. Les échéances en retard sont cochées d'office", async () => {
    await expect(page.getByText(/Reste à payer :\s*900\s000\sAr, dont 900\s000\sAr en retard/)).toBeVisible();
    await expect(carte(page, "Droits d'inscription")).toHaveAttribute("aria-pressed", "true");
    await expect(carte(page, "Juillet 2026")).toHaveAttribute("aria-pressed", "true");
    await expect(montantRecu(page)).toHaveValue(/^900\s000$/);
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC06-01-03-retards-coches");
  });

  await test.step("4. Ne garder que les droits et octobre : 180 000 Ar", async () => {
    await carte(page, "Novembre 2025").click();
    await expect(montantRecu(page)).toHaveValue(/^180\s000$/);
    await expect(page.getByText("Droits d'inscription → Octobre 2025 · 2 échéances soldées · Espèces")).toBeVisible();
    await expect(page.getByText(/Après ce paiement, il restera\s*720\s000\sAr à payer\./)).toBeVisible();
    await capture(page, DOSSIER, "UC06-01-04-deux-echeances");
    await grandEcran(page, 900);
  });

  let numero = "";
  await test.step("5. Encaisser 180 000 Ar", async () => {
    await boutonEncaisser(page, 180_000).click();
    const r = await recuEnregistre(page);
    numero = r.numero;
    await expect(r.zone).toContainText(/180\s000\sAr · Espèces · RAZAFINDRAKOTO Mialy\. Reste à payer : 720\s000\sAr\./);
    await expect.poll(() => impressions(page)).toBe(1);
    await expect(page.getByRole("combobox", { name: /Rechercher l'étudiant/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /RAZAFINDRAKOTO Mialy/ })).toContainText("720 000 Ar");
    await capture(page, DOSSIER, "UC06-01-05-recu-enregistre");
  });

  await test.step("6. Le ticket imprimé", async () => {
    const ticket = await ticketImprime(page, numero);
    await expect(ticket).toContainText(`N° ${numero}`);
    await expect(ticket).toContainText("RAZAFINDRAKOTO Mialy");
    await expect(ticket).toContainText("Matricule SF-2025-0001");
    await expect(ticket).toContainText("Droits d'inscription");
    await expect(ticket).toContainText("Octobre 2025");
    await expect(ticket).toContainText("cent quatre-vingt mille ariary");
    await expect(ticket).toContainText(/Reste à payer\s*720\s000\sAr/);
    expect(await logoAffiche(ticket)).toBe(true);
    await capture(page, DOSSIER, "UC06-01-06-ticket-imprime", ticket);
    await finImpression(page);
  });

  await test.step("7. Paiements", async () => {
    await page.goto("/app/paiements");
    const ligne = page.getByRole("row").filter({ hasText: numero });
    await expect(ligne).toContainText(/180\s000\sAr/);
    await expect(ligne).toContainText("Espèces");
    await expect(ligne).toContainText("Valide");
    await capture(page, DOSSIER, "UC06-01-07-paiements");
  });

  await test.step("8. La fiche de l'étudiante", async () => {
    await page.getByRole("row").filter({ hasText: numero }).getByRole("link", { name: `${E.nom} ${E.prenoms}` }).click();
    await expect(page.getByRole("tab", { name: "Paiements (1)" })).toBeVisible();
    await expect(page.getByText(/720\s000\sAr/).first()).toBeVisible();
    await grandEcran(page, 1500);
    await capture(page, DOSSIER, "UC06-01-08-fiche");
  });
});
