/*
  Warnings:

  - You are about to drop the `journal_audit` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "journal_audit" DROP CONSTRAINT "journal_audit_userId_fkey";

-- DropTable
DROP TABLE "journal_audit";
