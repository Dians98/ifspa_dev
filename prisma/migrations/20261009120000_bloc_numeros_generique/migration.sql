-- BlocRecus devient BlocNumeros : un bloc se rattache à une clé du Compteur ("RECU:2026", "MATRICULE:IF:2026")
-- au lieu d'une année de reçus. Renommage plutôt que recréation, pour conserver les blocs existants.

ALTER TABLE "bloc_recus" RENAME TO "bloc_numeros";

ALTER TABLE "bloc_numeros" ALTER COLUMN "annee" TYPE TEXT USING 'RECU:' || "annee"::TEXT;
ALTER TABLE "bloc_numeros" RENAME COLUMN "annee" TO "cle";

ALTER TABLE "bloc_numeros" RENAME CONSTRAINT "bloc_recus_pkey" TO "bloc_numeros_pkey";
ALTER TABLE "bloc_numeros" RENAME CONSTRAINT "bloc_recus_reserveParId_fkey" TO "bloc_numeros_reserveParId_fkey";

ALTER INDEX "bloc_recus_poste_annee_idx" RENAME TO "bloc_numeros_poste_cle_idx";
ALTER INDEX "bloc_recus_annee_premier_key" RENAME TO "bloc_numeros_cle_premier_key";
