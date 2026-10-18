import {
  boutonEncaisser,
  carte,
  choisirEtudiant,
  finImpression,
  grandEcran,
  inscrire,
  montantRecu,
  recuEnregistre,
  testPoste as test,
  ticketImprime,
  type EtudiantRecette,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC06-encaisser";
// Inscrit par ce cas, comme le ferait le secrétariat : droits payés en 3 fois.
const HAINGO: EtudiantRecette = {
  nom: "RAJAONARISON",
  prenoms: "Haingo",
  sexe: "Masculin",
  naissance: "2006-06-08",
  lieu: "Toamasina",
  telephone: "034 00 000 08",
  adresse: "Lot 31, Tanambao V, Toamasina",
  filiere: "IF",
  annee: "2026-2027",
  matricule: "IF-2026-0002",
};

test("UC06-04 : les droits d'inscription payés en trois tranches", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Inscrire l'étudiant en choisissant « En 3 fois »", async () => {
    await grandEcran(page, 1500);
    await inscrire(page, HAINGO, async () => {
      await page.getByRole("radio", { name: "En 3 fois" }).click();
      await expect(page.getByText(/34\s000\sAr à l'inscription \(octobre\) · 33\s000\sAr en novembre · 33\s000\sAr en décembre/)).toBeVisible();
      await capture(page, DOSSIER, "UC06-04-01-inscription-3-fois");
    });
    await capture(page, DOSSIER, "UC06-04-02-fiche-tranches");
    await grandEcran(page, 900);
  });

  await test.step("2. Encaisser depuis la fiche : les trois tranches sont des échéances", async () => {
    await page.getByRole("link", { name: "Encaisser les droits d'inscription" }).click();
    await page.waitForURL(/\/app\/encaisser\?etudiant=/);
    await expect(montantRecu(page)).toBeFocused();
    await expect(carte(page, "Droits — tranche 1/3")).toBeVisible();
    await expect(carte(page, "Droits — tranche 2/3")).toBeVisible();
    await expect(carte(page, "Droits — tranche 3/3")).toBeVisible();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC06-04-03-guichet-tranches");
    await grandEcran(page, 900);
  });

  let numero = "";
  await test.step("3. Payer la première tranche : 34 000 Ar", async () => {
    await carte(page, "Droits — tranche 1/3").click();
    await expect(montantRecu(page)).toHaveValue(/^34\s000$/);
    await boutonEncaisser(page, 34_000).click();
    numero = (await recuEnregistre(page)).numero;
    const ticket = await ticketImprime(page, numero);
    await expect(ticket).toContainText("Droits — tranche 1/3");
    await expect(ticket).toContainText("trente-quatre mille ariary");
    await capture(page, DOSSIER, "UC06-04-04-ticket-tranche-1", ticket);
    await finImpression(page);
  });

  await test.step("4. Le parent revient avec 100 000 Ar : octobre est soldé, 20 000 Ar partent en acompte sur la tranche 2/3", async () => {
    await choisirEtudiant(page, HAINGO);
    await montantRecu(page).fill("100000");
    await expect(page.getByText(/20\s000\sAr d'acompte sur les droits — tranche 2\/3, il restera 13\s000\sAr\./)).toBeVisible();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC06-04-05-acompte-tranche-2");
    await grandEcran(page, 900);
    await boutonEncaisser(page, 100_000).click();
    const second = (await recuEnregistre(page)).numero;
    const ticket = await ticketImprime(page, second);
    await expect(ticket).toContainText("Octobre 2026");
    await expect(ticket).toContainText("Droits — tranche 2/3");
    await expect(ticket).toContainText(/Acompte · reste dû 13\s000\sAr/);
    await capture(page, DOSSIER, "UC06-04-06-ticket-acompte-tranche-2", ticket);
    await finImpression(page);
  });

  await test.step("5. La fiche : tranche 1 payée, tranche 2 en partie", async () => {
    await page.goto("/app/paiements");
    await page.getByRole("row").filter({ hasText: numero }).getByRole("link", { name: `${HAINGO.nom} ${HAINGO.prenoms}` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(HAINGO.nom);
    await expect(page.getByText("Droits payés en 3 fois")).toBeVisible();
    await grandEcran(page, 1500);
    await capture(page, DOSSIER, "UC06-04-07-fiche");
  });
});
