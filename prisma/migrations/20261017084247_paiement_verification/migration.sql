-- AlterTable
ALTER TABLE "paiement" ADD COLUMN     "dateVerification" TIMESTAMP(3),
ADD COLUMN     "noteVerification" TEXT,
ADD COLUMN     "verifieParId" TEXT;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_verifieParId_fkey" FOREIGN KEY ("verifieParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
