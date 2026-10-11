-- AlterTable
ALTER TABLE "etudiant" ADD COLUMN     "recherche" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "paiement" ADD COLUMN     "resteApres" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retardApres" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "etudiant_recherche_idx" ON "etudiant"("recherche");

-- CreateIndex
CREATE INDEX "paiement_saisiParId_idx" ON "paiement"("saisiParId");
