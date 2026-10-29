-- Phase 10 : droits sans tranches, frais en cours d'année, libellé figé sur la ligne de paiement.
-- Compatible PostgreSQL 10 et jouée en autocommit par psql -f en production : aucune instruction ne dépend d'une transaction englobante.

-- Enum recréé : ALTER TYPE ... ADD VALUE est refusé dans une transaction avant PostgreSQL 12 (prisma migrate deploy).
CREATE TYPE "TypeEcheance_new" AS ENUM ('DROITS', 'MENSUALITE', 'FRAIS');
ALTER TABLE "echeance" ALTER COLUMN "type" TYPE "TypeEcheance_new" USING ("type"::text::"TypeEcheance_new");
DROP TYPE "TypeEcheance";
ALTER TYPE "TypeEcheance_new" RENAME TO "TypeEcheance";

-- Une seule échéance de droits par inscription : la tranche 1 garde son id, reçoit les lignes des tranches 2 et 3
-- et la somme de leurs montants, puis les autres tranches sont supprimées (la clé étrangère des lignes l'impose).
UPDATE "paiement_ligne" pl
SET "echeanceId" = g.id
FROM "echeance" ec
JOIN (
  SELECT DISTINCT ON ("inscriptionId") "inscriptionId", id
  FROM "echeance"
  WHERE "type" = 'DROITS'
  ORDER BY "inscriptionId", "tranche" NULLS FIRST, "mois", id
) g ON g."inscriptionId" = ec."inscriptionId"
WHERE pl."echeanceId" = ec.id AND ec."type" = 'DROITS' AND ec.id <> g.id;

UPDATE "echeance" ec
SET "montantDu" = t.total
FROM (
  SELECT DISTINCT ON ("inscriptionId") "inscriptionId", id
  FROM "echeance"
  WHERE "type" = 'DROITS'
  ORDER BY "inscriptionId", "tranche" NULLS FIRST, "mois", id
) g
JOIN (
  SELECT "inscriptionId", SUM("montantDu")::int AS total FROM "echeance" WHERE "type" = 'DROITS' GROUP BY "inscriptionId"
) t ON t."inscriptionId" = g."inscriptionId"
WHERE ec.id = g.id;

DELETE FROM "echeance" ec
WHERE ec."type" = 'DROITS'
  AND ec.id NOT IN (
    SELECT DISTINCT ON ("inscriptionId") id
    FROM "echeance"
    WHERE "type" = 'DROITS'
    ORDER BY "inscriptionId", "tranche" NULLS FIRST, "mois", id
  );

-- Un paiement qui soldait deux tranches n'a plus qu'une ligne de droits.
UPDATE "paiement_ligne" pl
SET "montant" = d.total
FROM (
  SELECT "paiementId", "echeanceId", MIN(id) AS garde, SUM("montant")::int AS total
  FROM "paiement_ligne"
  GROUP BY "paiementId", "echeanceId"
  HAVING COUNT(*) > 1
) d
WHERE pl.id = d.garde;

DELETE FROM "paiement_ligne" pl
USING (
  SELECT "paiementId", "echeanceId", MIN(id) AS garde
  FROM "paiement_ligne"
  GROUP BY "paiementId", "echeanceId"
  HAVING COUNT(*) > 1
) d
WHERE pl."paiementId" = d."paiementId" AND pl."echeanceId" = d."echeanceId" AND pl.id <> d.garde;

-- Reste figé des lignes de droits fusionnées, recalculé à la date de chaque paiement
-- (un paiement annulé plus tard comptait encore à cette date).
UPDATE "paiement_ligne" pl
SET "resteEcheanceApres" = GREATEST(0, ec."montantDu" - (
  SELECT COALESCE(SUM(pl2."montant"), 0)
  FROM "paiement_ligne" pl2
  JOIN "paiement" p2 ON p2.id = pl2."paiementId"
  WHERE pl2."echeanceId" = pl."echeanceId"
    AND (p2."date", p2.id) <= (p."date", p.id)
    AND (NOT p2."annule" OR p2.id = p.id OR p2."dateAnnulation" > p."date")
))
FROM "echeance" ec, "inscription" i, "paiement" p
WHERE ec.id = pl."echeanceId" AND i.id = ec."inscriptionId" AND p.id = pl."paiementId"
  AND ec."type" = 'DROITS' AND i."droitsEnTranches" > 1;

-- Droits exigibles au 3e mois de l'écolage (décembre par défaut) et toujours dus, même après une sortie.
UPDATE "echeance" ec
SET "mois" = (make_date(a."anneeDebut", a."moisDebutEcolage", 1) + INTERVAL '2 months')::date,
    "nonDueSortie" = false
FROM "inscription" i
JOIN "annee_scolaire" a ON a.id = i."anneeScolaireId"
WHERE i.id = ec."inscriptionId" AND ec."type" = 'DROITS';

-- DropIndex
DROP INDEX "echeance_inscriptionId_ordre_key";

-- AlterTable
ALTER TABLE "echeance" DROP COLUMN "ordre",
DROP COLUMN "tranche",
ADD COLUMN     "fraisId" TEXT;

-- AlterTable
ALTER TABLE "inscription" DROP COLUMN "droitsEnTranches";

-- AlterTable
ALTER TABLE "paiement_ligne" ADD COLUMN     "libelle" TEXT;

-- CreateTable
CREATE TABLE "frais" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "mois" DATE NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "rang" SERIAL NOT NULL,
    "creeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "frais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frais_classe" (
    "id" TEXT NOT NULL,
    "fraisId" TEXT NOT NULL,
    "filiereId" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,

    CONSTRAINT "frais_classe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "frais_rang_key" ON "frais"("rang");

-- CreateIndex
CREATE INDEX "frais_anneeScolaireId_idx" ON "frais"("anneeScolaireId");

-- CreateIndex
CREATE INDEX "frais_classe_filiereId_niveau_idx" ON "frais_classe"("filiereId", "niveau");

-- CreateIndex
CREATE UNIQUE INDEX "frais_classe_fraisId_filiereId_niveau_key" ON "frais_classe"("fraisId", "filiereId", "niveau");

-- CreateIndex
CREATE INDEX "echeance_fraisId_idx" ON "echeance"("fraisId");

-- CreateIndex
CREATE UNIQUE INDEX "echeance_un_seul_droits" ON "echeance"("inscriptionId") WHERE ("type" = 'DROITS');

-- CreateIndex
CREATE UNIQUE INDEX "echeance_une_mensualite_par_mois" ON "echeance"("inscriptionId", "mois") WHERE ("type" = 'MENSUALITE');

-- CreateIndex
CREATE UNIQUE INDEX "echeance_inscriptionId_fraisId_key" ON "echeance"("inscriptionId", "fraisId");

-- AddForeignKey
ALTER TABLE "echeance" ADD CONSTRAINT "echeance_fraisId_fkey" FOREIGN KEY ("fraisId") REFERENCES "frais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frais" ADD CONSTRAINT "frais_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annee_scolaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frais" ADD CONSTRAINT "frais_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frais_classe" ADD CONSTRAINT "frais_classe_fraisId_fkey" FOREIGN KEY ("fraisId") REFERENCES "frais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frais_classe" ADD CONSTRAINT "frais_classe_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "filiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
