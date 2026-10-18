import { boutonEncaisser, choisirEtudiant, montantRecu, recuEnregistre, testPoste as test } from "./aides";
import { ETUDIANTS, SECTION_H } from "./aides-sorties";
import { expect } from "./outils";

// Section I de 00-PREPARATION.md, à lancer avec 00e (section G) dans la même commande : même navigateur, reçus R-2026-00021 à 00032.
const PAIEMENTS = [
  { qui: ETUDIANTS.tiana, montant: 100_000 },
  { qui: ETUDIANTS.mialy, montant: 900_000 },
  { qui: ETUDIANTS.lalaina, montant: 50_000 },
  { qui: ETUDIANTS.solofo, montant: 100_000 },
  { qui: ETUDIANTS.voahirana, montant: 80_000 },
  { qui: ETUDIANTS.nirina, montant: 30_000 },
  { qui: SECTION_H.helene, montant: 34_000 },
  { qui: SECTION_H.hery, montant: 100_000 },
  { qui: SECTION_H.faly, montant: 100_000 },
] as const;

test("I. neuf paiements de plus au guichet : un étudiant soldé, des acomptes, les trois étudiants de la section H", async ({ page }) => {
  test.setTimeout(240_000);
  const numeros: string[] = [];
  for (const { qui, montant } of PAIEMENTS) {
    await test.step(`I. Secrétariat : ${qui.nom} ${qui.prenoms} paie ${montant} Ar`, async () => {
      await page.goto("/app/encaisser");
      await choisirEtudiant(page, qui);
      await montantRecu(page).fill(String(montant));
      await boutonEncaisser(page, montant).click();
      numeros.push((await recuEnregistre(page)).numero);
    });
  }
  console.log(`NUMEROS-I ${numeros.join(" ")}`);
  expect(numeros).toHaveLength(9);
});
