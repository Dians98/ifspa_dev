import {
  boutonEncaisser,
  carte,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  grandEcran,
  montantRecu,
  recuEnregistre,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC06-encaisser";
const E = ETUDIANTS.voahirana;

test("UC06-06 : un étudiant qui doit aussi l'année précédente solde d'abord le plus ancien", async ({ page }) => {
  test.setTimeout(90_000);
  const annee2025 = page.getByRole("group", { name: /Année 2025-2026/ });
  const annee2026 = page.getByRole("group", { name: /Année 2026-2027/ });

  await test.step("1. Le guichet affiche tout l'impayé, année par année", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*1\s800\s000\sAr, dont 900\s000\sAr en retard/)).toBeVisible();
    await expect(annee2025).toBeVisible();
    await expect(annee2026).toBeVisible();
    // 2025-2026 est en retard : coché d'office ; 2026-2027 est à venir : non coché.
    await expect(annee2025.getByRole("button", { pressed: true })).toHaveCount(11);
    await expect(annee2026.getByRole("button", { pressed: true })).toHaveCount(0);
    await expect(montantRecu(page)).toHaveValue(/^900\s000$/);
    await grandEcran(page, 2500);
    await capture(page, DOSSIER, "UC06-06-01-deux-annees");
    await grandEcran(page, 900);
  });

  await test.step("2. Premier paiement de 180 000 Ar : droits et octobre 2025", async () => {
    await annee2025.getByRole("button", { name: /^Novembre 2025,/ }).click();
    await expect(montantRecu(page)).toHaveValue(/^180\s000$/);
    await boutonEncaisser(page, 180_000).click();
    const { numero } = await recuEnregistre(page);
    const ticket = await ticketImprime(page, numero);
    await expect(ticket).toContainText("Octobre 2025");
    await expect(ticket).toContainText(/Reste à payer\s*1\s620\s000\sAr/);
    await capture(page, DOSSIER, "UC06-06-02-ticket-2025", ticket);
    await finImpression(page);
  });

  await test.step("3. Second paiement de 820 000 Ar : le reste de 2025-2026, puis les droits de 2026-2027", async () => {
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*1\s620\s000\sAr, dont 720\s000\sAr en retard/)).toBeVisible();
    await montantRecu(page).fill("820000");
    await expect(annee2025.getByRole("button", { pressed: true })).toHaveCount(9);
    await expect(carte(page, "Droits d'inscription")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/Après ce paiement, il restera\s*800\s000\sAr à payer\./)).toBeVisible();
    await grandEcran(page, 2500);
    await capture(page, DOSSIER, "UC06-06-03-plus-ancien-d-abord");
    await grandEcran(page, 900);
  });

  await test.step("4. Encaisser : l'année précédente est soldée en premier", async () => {
    await boutonEncaisser(page, 820_000).click();
    const { numero } = await recuEnregistre(page);
    const ticket = await ticketImprime(page, numero);
    await expect(ticket).toContainText("Juillet 2026");
    await expect(ticket).toContainText("huit cent vingt mille ariary");
    await expect(ticket).toContainText(/Reste à payer\s*800\s000\sAr/);
    await capture(page, DOSSIER, "UC06-06-04-ticket-820000", ticket);
    await finImpression(page);
  });

  await test.step("5. La fiche : 2025-2026 soldée, 2026-2027 commencée", async () => {
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /RAKOTOMALALA Voahirana/ }).first().click();
    await expect(page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 2e année" })).toBeVisible();
    await expect(page.getByText(/800\s000\sAr/).first()).toBeVisible();
    await grandEcran(page, 2200);
    await capture(page, DOSSIER, "UC06-06-05-fiche");
  });
});
