import { randomUUID } from "node:crypto";
import { Client } from "pg";

// Une filière jetable avec trois étudiants en 1re année : une validation de classe ne touche que cette filière,
// les autres classes de la base de dev (partagée entre les projets ordinateur et mobile) restent intactes.

export type ClasseTest = {
  filiereId: string;
  /** « Filière E2E AB12 » */
  filiereNom: string;
  /** « Filière E2E AB12 1re année » */
  libelle: string;
  /** Valeur de `?classe=` */
  cle: string;
  /** Alphabétique : le premier passe, le deuxième redouble, le troisième abandonne. */
  etudiants: { id: string; nom: string; prenoms: string; nomComplet: string }[];
};

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
 * Année 2027-2028 créée si elle manque (le seed n'a que 2026-2027) et laissée en place : deux projets Playwright
 * peuvent tourner en même temps et la supprimer sous les pieds de l'autre. Ses tarifs sont ceux de la filière jetable.
 */
export async function creerClasseTest(): Promise<ClasseTest> {
  const suffixe = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.toUpperCase();
  const code = `ZA${suffixe}`.slice(0, 12);
  const filiereNom = `Filière E2E ${suffixe}`;

  return avecBase(async (c) => {
    const source = await c.query<{ id: string }>(`SELECT id FROM annee_scolaire WHERE "estCourante" LIMIT 1`);
    if (!source.rows[0]) throw new Error("Année courante absente : lancez `pnpm db:seed`.");
    await c.query(
      `INSERT INTO annee_scolaire (id, libelle, "anneeDebut", "dateDebut", "dateFin", "moisDebutEcolage", "updatedAt")
       VALUES ($1, '2027-2028', 2027, '2027-10-01', '2028-07-31', 10, now())
       ON CONFLICT (libelle) DO NOTHING`,
      [randomUUID()],
    );
    const cible = await c.query<{ id: string }>(`SELECT id FROM annee_scolaire WHERE libelle = '2027-2028'`);

    const filiereId = randomUUID();
    await c.query(`INSERT INTO filiere (id, code, nom, "dureeAnnees", actif, "updatedAt") VALUES ($1, $2, $3, 3, true, now())`, [
      filiereId,
      code,
      filiereNom,
    ]);
    for (const niveau of [1, 2]) {
      await c.query(
        `INSERT INTO tarif (id, "filiereId", "anneeScolaireId", niveau, "droitsInscription", "montantMensuel", "nombreMois", "updatedAt")
         VALUES ($1, $2, $3, $4, 60000, 80000, 10, now())`,
        [randomUUID(), filiereId, cible.rows[0].id, niveau],
      );
    }

    const etudiants: ClasseTest["etudiants"] = [];
    for (const [rang, lettre] of ["A", "B", "C"].entries()) {
      const id = randomUUID();
      const nom = `ZZ${lettre}${suffixe}`;
      const prenoms = "Test Passage";
      const matricule = `${code}-${rang + 1}`;
      await c.query(
        `INSERT INTO etudiant (id, matricule, nom, prenoms, sexe, "dateNaissance", "lieuNaissance", telephone, recherche, "filiereId", "anneeEntreeId", "updatedAt")
         VALUES ($1, $2, $3, $4, 'F', '2005-01-01', 'Toamasina', '0341234567', $5, $6, $7, now())`,
        [id, matricule, nom, prenoms, `${nom} ${prenoms} ${matricule}`.toLowerCase(), filiereId, source.rows[0].id],
      );
      await c.query(`INSERT INTO inscription (id, "etudiantId", "anneeScolaireId", niveau, "updatedAt") VALUES ($1, $2, $3, 1, now())`, [
        randomUUID(),
        id,
        source.rows[0].id,
      ]);
      etudiants.push({ id, nom, prenoms, nomComplet: `${nom} ${prenoms}` });
    }

    return { filiereId, filiereNom, libelle: `${filiereNom} 1re année`, cle: `${filiereId}:1`, etudiants };
  });
}

/** Supprime aussi les inscriptions créées par un passage resté validé après un test interrompu. */
export async function supprimerClasseTest(classe: ClasseTest): Promise<void> {
  await avecBase(async (c) => {
    const ids = classe.etudiants.map((e) => e.id);
    await c.query(`DELETE FROM inscription WHERE "etudiantId" = ANY($1)`, [ids]);
    await c.query(`DELETE FROM operation_admission WHERE "filiereId" = $1`, [classe.filiereId]);
    await c.query(`DELETE FROM etudiant WHERE id = ANY($1)`, [ids]);
    await c.query(`DELETE FROM tarif WHERE "filiereId" = $1`, [classe.filiereId]);
    await c.query(`DELETE FROM filiere WHERE id = $1`, [classe.filiereId]);
  });
}
