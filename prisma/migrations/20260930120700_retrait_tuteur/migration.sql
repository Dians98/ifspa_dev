/*
  Warnings:

  - You are about to drop the column `tuteurNom` on the `etudiant` table. All the data in the column will be lost.
  - You are about to drop the column `tuteurTelephone` on the `etudiant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "etudiant" DROP COLUMN "tuteurNom",
DROP COLUMN "tuteurTelephone";
