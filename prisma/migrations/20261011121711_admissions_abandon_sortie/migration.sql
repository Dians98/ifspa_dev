-- AlterEnum
ALTER TYPE "DecisionAdmission" ADD VALUE 'ABANDON';

-- AlterTable
ALTER TABLE "echeance" ADD COLUMN     "nonDueSortie" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ligne_admission" ADD COLUMN     "ancienMotifSortie" TEXT,
ADD COLUMN     "ancienneDateSortie" DATE;

-- CreateIndex
CREATE INDEX "ligne_admission_operationId_idx" ON "ligne_admission"("operationId");

-- CreateIndex
CREATE INDEX "ligne_admission_inscriptionSourceId_idx" ON "ligne_admission"("inscriptionSourceId");

-- CreateIndex
CREATE INDEX "operation_admission_anneeSourceId_filiereId_niveauSource_idx" ON "operation_admission"("anneeSourceId", "filiereId", "niveauSource");
