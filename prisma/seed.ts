// Données initiales. Relançable sans créer de doublons : npx prisma db seed
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Administrateur";
  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL et SEED_ADMIN_PASSWORD doivent être définis dans .env");
  }

  const existant = await db.user.findUnique({ where: { email } });
  if (existant) {
    console.log(`• Admin déjà présent : ${email}`);
    return;
  }

  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      name,
      email,
      emailVerified: true,
      role: "admin",
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  console.log(`✓ Admin créé : ${email}`);
}

async function seedReferentiels() {
  await db.etablissement.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const filieres = [
    { code: "IF", nom: "Infirmier(e)s", dureeAnnees: 3 },
    { code: "SF", nom: "Sage-femmes", dureeAnnees: 3 },
  ];
  for (const f of filieres) {
    await db.filiere.upsert({ where: { code: f.code }, update: {}, create: f });
  }
  console.log("✓ Filières : IF, SF");

  const annee = await db.anneeScolaire.upsert({
    where: { anneeDebut: 2026 },
    update: {},
    create: {
      libelle: "2026-2027",
      anneeDebut: 2026,
      dateDebut: new Date("2026-10-01"),
      dateFin: new Date("2027-07-31"),
      moisDebutEcolage: 10,
      estCourante: true,
    },
  });
  console.log(`✓ Année scolaire : ${annee.libelle}`);

  // Montants d'exemple à ajuster dans Paramètres > Tarifs.
  const toutes = await db.filiere.findMany();
  for (const filiere of toutes) {
    for (let niveau = 1; niveau <= filiere.dureeAnnees; niveau++) {
      await db.tarif.upsert({
        where: {
          filiereId_anneeScolaireId_niveau: {
            filiereId: filiere.id,
            anneeScolaireId: annee.id,
            niveau,
          },
        },
        update: {},
        create: {
          filiereId: filiere.id,
          anneeScolaireId: annee.id,
          niveau,
          droitsInscription: 100_000,
          montantMensuel: 80_000,
          nombreMois: 10,
        },
      });
    }
  }
  console.log("✓ Tarifs d'exemple (100 000 Ar de droits, 80 000 Ar/mois sur 10 mois)");
}

async function main() {
  await seedReferentiels();
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
