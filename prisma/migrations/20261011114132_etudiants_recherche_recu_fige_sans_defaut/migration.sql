-- AlterTable
ALTER TABLE "etudiant" ALTER COLUMN "recherche" DROP DEFAULT;

-- AlterTable
ALTER TABLE "paiement" ALTER COLUMN "resteApres" DROP DEFAULT,
ALTER COLUMN "retardApres" DROP DEFAULT;
