import { randomUUID } from "node:crypto";
import { test as base } from "@playwright/test";
import { Client } from "pg";

// Données jetables des parcours d'écolage : écrites en SQL (pg) pour ne dépendre ni de Next ni du client Prisma.

export type EtudiantTest = {
  id: string;
  nom: string;
  prenoms: string;
  /** « NOM Prénoms » tel qu'affiché. */
  nomComplet: string;
  /** Libellés des échéances, dans l'ordre de solde (« Janvier 2020 »…). */
  echeances: string[];
};

const MOIS = ["Janvier", "Février", "Mars", "Avril"];

async function avecBase<T>(travail: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return await travail(c);
  } finally {
    await c.end();
  }
}

/**
 * Étudiant actif avec 4 mensualités de 80 000 Ar de janvier à avril 2020 : toutes échues, donc toutes
 * en retard au guichet, quelle que soit la date du jour. Rattaché à l'année courante du seed.
 */
export async function creerEtudiantTest(): Promise<EtudiantTest> {
  const suffixe = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.toUpperCase();
  const nom = `ZZE2E${suffixe}`;
  const prenoms = "Test Guichet";
  const matricule = `E2E-${suffixe}`;
  const recherche = `${nom} ${prenoms} ${matricule}`.toLowerCase().replace(/\s+/g, " ");

  return avecBase(async (c) => {
    const annee = await c.query<{ id: string }>(`SELECT id FROM annee_scolaire WHERE "estCourante" LIMIT 1`);
    const filiere = await c.query<{ id: string }>(`SELECT id FROM filiere ORDER BY code LIMIT 1`);
    if (!annee.rows[0] || !filiere.rows[0]) throw new Error("Année courante ou filière absente : lancez `pnpm db:seed`.");

    const id = randomUUID();
    const inscriptionId = randomUUID();
    await c.query(
      `INSERT INTO etudiant (id, matricule, nom, prenoms, sexe, "dateNaissance", "lieuNaissance", telephone, recherche, "filiereId", "anneeEntreeId", "updatedAt")
       VALUES ($1, $2, $3, $4, 'F', '2005-01-01', 'Toamasina', '0341234567', $5, $6, $7, now())`,
      [id, matricule, nom, prenoms, recherche, filiere.rows[0].id, annee.rows[0].id],
    );
    await c.query(`INSERT INTO inscription (id, "etudiantId", "anneeScolaireId", niveau, "updatedAt") VALUES ($1, $2, $3, 1, now())`, [
      inscriptionId,
      id,
      annee.rows[0].id,
    ]);
    for (let i = 0; i < MOIS.length; i++) {
      await c.query(
        `INSERT INTO echeance (id, "inscriptionId", type, mois, "montantDu")
         VALUES ($1, $2, 'MENSUALITE', $3, 80000)`,
        [randomUUID(), inscriptionId, `2020-0${i + 1}-01`],
      );
    }
    return { id, nom, prenoms, nomComplet: `${nom} ${prenoms}`, echeances: MOIS.map((m) => `${m} 2020`) };
  });
}

/** Les paiements ne se suppriment jamais dans l'application : ce nettoyage ne sert qu'aux données de test. */
export async function supprimerEtudiantTest(id: string): Promise<void> {
  await avecBase(async (c) => {
    await c.query(`DELETE FROM paiement WHERE "etudiantId" = $1`, [id]);
    await c.query(`DELETE FROM inscription WHERE "etudiantId" = $1`, [id]);
    await c.query(`DELETE FROM etudiant WHERE id = $1`, [id]);
  });
}

/** `test` avec un étudiant jetable (`etudiant`) et `window.print` neutralisé, compté dans `window.__impressions`. */
export const test = base.extend<{ etudiant: EtudiantTest }>({
  etudiant: async ({}, fournir) => {
    const etudiant = await creerEtudiantTest();
    try {
      await fournir(etudiant);
    } finally {
      await supprimerEtudiantTest(etudiant.id);
    }
  },
  page: async ({ page }, fournir) => {
    await page.addInitScript(() => {
      const fenetre = window as unknown as { __impressions: number };
      fenetre.__impressions = 0;
      window.print = () => {
        fenetre.__impressions += 1;
      };
    });
    await fournir(page);
  },
});

export { expect } from "@playwright/test";
