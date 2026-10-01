-- AlterTable
ALTER TABLE "echeance" ADD COLUMN     "tranche" INTEGER;

-- AlterTable
ALTER TABLE "inscription" ADD COLUMN     "droitsEnTranches" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "paiement" ADD COLUMN     "aVerifier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "idClient" TEXT;

-- CreateTable
CREATE TABLE "bloc_recus" (
    "id" TEXT NOT NULL,
    "poste" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "premier" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL,
    "reserveParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloc_recus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bloc_recus_poste_annee_idx" ON "bloc_recus"("poste", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "bloc_recus_annee_premier_key" ON "bloc_recus"("annee", "premier");

-- CreateIndex
CREATE UNIQUE INDEX "paiement_idClient_key" ON "paiement"("idClient");

-- CreateIndex
CREATE INDEX "paiement_aVerifier_idx" ON "paiement"("aVerifier");

-- AddForeignKey
ALTER TABLE "bloc_recus" ADD CONSTRAINT "bloc_recus_reserveParId_fkey" FOREIGN KEY ("reserveParId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

