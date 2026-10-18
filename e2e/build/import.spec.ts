import { Client } from "pg";
import { SESSIONS, expect, test } from "../../recette/parcours/outils";

// Import réel, sur la base de recette : `pnpm build` puis `pnpm recette:parcours --project build`.

function urlRecette(): string {
  const u = new URL(process.env.DATABASE_URL ?? "");
  u.pathname = "/ifspa_recette";
  return u.toString();
}

async function requete<T>(sql: string, valeurs: unknown[]): Promise<T[]> {
  const c = new Client({ connectionString: urlRecette() });
  await c.connect();
  try {
    return (await c.query(sql, valeurs)).rows as T[];
  } finally {
    await c.end();
  }
}

const lettres = () => Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");

function csv(lignes: string[][]): Buffer {
  return Buffer.from("﻿" + lignes.map((l) => l.join(";")).join("\r\n") + "\r\n", "utf8");
}

test.describe("Reprise des données — import réel", () => {
  test.use({ storageState: SESSIONS.admin });

  test("importer deux étudiants et leurs paiements, puis relancer sans doublon", async ({ page }) => {
    const nomA = `RAKOTO${lettres()}`;
    const nomB = `RASOA${lettres()}`;
    const etudiants = csv([
      ["N° *", "Nom *", "Prénoms *", "Sexe *", "Date de naissance *", "Lieu de naissance *", "CIN", "Téléphone", "Adresse", "Filière *", "Année d'entrée *", "Niveau 2026-2027 *", "Redoublant", "Droits en"],
      ["1", nomA, "Hanitra", "F", "14/03/2007", "Toamasina", "", "", "Tanambao V", "IF", "2026", "1", "non", "3"],
      ["2", nomB, "Fanja", "F", "02/11/2006", "Fénérive-Est", "", "", "Ankirihiry", "SF", "2026", "1", "non", "1"],
    ]);
    // Droits en 3 fois : 1re tranche 34 000 + octobre 80 000 ; droits en 1 fois : 100 000 + octobre 80 000.
    const paiements = csv([
      ["N° étudiant *", "Date *", "Montant (Ar) *", "Mode *", "Opérateur", "Référence", "N° reçu papier"],
      ["1", "05/10/2026", "114000", "Espèces", "", "", "0412"],
      ["2", "08/10/2026", "180000", "Mobile Money", "MVola", "MP261008.1432.A1", "0420"],
    ]);
    const fichiers = [
      { name: "etudiants.csv", mimeType: "text/csv", buffer: etudiants },
      { name: "paiements.csv", mimeType: "text/csv", buffer: paiements },
    ];

    await page.goto("/app/parametres/import");
    await page.locator('input[type="file"]').setInputFiles(fichiers);
    await page.getByRole("button", { name: "Analyser les fichiers" }).click();
    await expect(page.getByText("Prêt à importer 2 nouveaux étudiants et 2 paiements.")).toBeVisible();

    await page.getByRole("button", { name: "Importer 2 étudiants et 2 paiements" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Importer maintenant" }).click();
    await expect(
      page.getByRole("main").getByText(/^Import terminé : 2 étudiants créés, 2 paiements enregistrés pour 294\s000\sAr/),
    ).toBeVisible({ timeout: 30_000 });

    const crees = await requete<{ matricule: string; nom: string }>(
      `SELECT matricule, nom FROM etudiant WHERE nom = ANY($1) ORDER BY matricule`,
      [[nomA, nomB]],
    );
    expect(crees.map((e) => e.matricule)).toEqual([expect.stringMatching(/^IF-2026-\d{4}$/), expect.stringMatching(/^SF-2026-\d{4}$/)]);

    const recus = await requete<{ montant: number; observation: string; idClient: string; resteApres: number }>(
      `SELECT p.montant, p.observation, p."idClient", p."resteApres" FROM paiement p JOIN etudiant e ON e.id = p."etudiantId"
       WHERE e.nom = ANY($1) ORDER BY p.date`,
      [[nomA, nomB]],
    );
    expect(recus).toHaveLength(2);
    expect(recus[0]).toMatchObject({ montant: 114_000, observation: "Reprise des données · reçu papier n° 0412" });
    expect(recus[0].idClient).toMatch(/^reprise:/);
    // IF 1re année : 100 000 + 10 × 80 000 = 900 000 dus, 114 000 payés.
    expect(recus[0].resteApres).toBe(786_000);

    // Relance du même fichier : rien de nouveau, l'import reste fermé.
    await page.getByRole("button", { name: "Importer un autre fichier" }).click();
    await page.locator('input[type="file"]').setInputFiles(fichiers);
    await page.getByRole("button", { name: "Analyser les fichiers" }).click();
    await expect(page.getByText("Prêt à importer 0 nouvel étudiant et 0 paiement.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Importer \d/ })).toBeDisabled();
    expect(await requete(`SELECT 1 FROM etudiant WHERE nom = ANY($1)`, [[nomA, nomB]])).toHaveLength(2);
  });
});
